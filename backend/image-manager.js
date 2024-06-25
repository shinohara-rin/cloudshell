import axios from 'axios'
import { existsSync, renameSync } from 'fs'
import { spawn, spawnSync } from 'child_process'
import process from 'process'
import { writeFile } from 'fs/promises'
import qemuWrapper from './qemu-wrapper.js'
import { resolve } from 'path'

const cheribuild_repo = "cocoa-xu/cheribuild"
const cheribuild_repo_url = `https://github.com/${cheribuild_repo}`
const cheribuild_download_baseurl = `${cheribuild_repo_url}/releases/download`
const cheribuild_release_purecap_image_xz_filename = "cheribsd-morello-purecap.img.xz"
const cheribuild_release_purecap_image_filename = "cheribsd-morello-purecap.img"

const get_latest_tag = async () => {
    if (process.env.NODE_ENV !== 'production') {
        return [true, "v2024.02.28-400ab789"]
    }

    const response = await axios.get(`https://api.github.com/repos/${cheribuild_repo}/git/refs/tags`)
    if (response.status == 200) {
        let tags = response.data
            .map(x => x.ref)
            .map(x => x.replace("refs/tags/", ""))
        let latestTag = tags[tags.length - 1]
        return [true, latestTag]
    } else {
        console.log(`[!] Failed to get latest tag: ${response.status}`)
        return [false, null]
    }

}

const download_from_release = async (latestTag, release_filename, cache_filename) => {

    if (existsSync(cache_filename)) {
        console.log(`[-] ${cache_filename} already exists, skipping download`);
        return [true, cache_filename]
    }
    console.log(`[+] Downloading ${release_filename} to ${cache_filename}`)
    const url = `${cheribuild_download_baseurl}/${latestTag}/${release_filename}`
    try {
        let response = await axios.get(url, { responseType: 'arraybuffer' })
        if (response.status == 200) {
            console.log(`[+] Downloaded ${release_filename} to ${cache_filename}`)
            await writeFile(cache_filename, response.data)
            return [true, cache_filename]
        }
    } catch (error) {
        console.log(`[!] Failed to download ${url}: ${error}`)
    }
    
    return [false, null]
}

const download_image = async (latestTag) => {
    const cache_filename = `cheribsd-morello-purecap-${latestTag}.img.xz`
    return await download_from_release(latestTag, cheribuild_release_purecap_image_xz_filename, cache_filename)
}

const get_machine_triplet = async () => {
    switch (process.platform) {
        case "linux":
            return await get_linux_machine_triplet()
        case "darwin":
            return await get_darwin_machine_triplet()
        default:
            return [false, null]
    }
}

const get_linux_machine_triplet = async () => {
    switch (process.arch) {
        case "arm64":
            return [true, "aarch64-linux-gnu"]
        case "x86_64":
            return [true, "x86_64-linux-gnu"]
        default:
            return [false, null]
    }
}

const get_darwin_machine_triplet = async () => {
    switch (process.arch) {
        case "arm64":
            return [true, "aarch64-apple-darwin"]
        case "x86_64":
            return [true, "x86_64-apple-darwin"]
        default:
            return [false, null]
    }
}

const download_qemu = async (latestTag) => {
    const [detected, triplet] = await get_machine_triplet()
    console.log(`[+] Detected machine triplet: ${triplet}`)
    if (!detected) {
        console.log("[!] Failed to detect machine triplet")
        return [false, null]
    }
    const release_filename = `qemu-${triplet}.tar.xz`
    const cache_filename = `qemu-${triplet}-${latestTag}.tar.xz`
    return await download_from_release(latestTag, release_filename, cache_filename)
}

const unarchive_image = async (filename) => {
    if (filename.endsWith(".xz")) {
        const image_filename = filename.replace(".xz", "")
        if (existsSync(image_filename)) {
            console.log(`[-] ${image_filename} already exists, skipping unarchive`)
            return [true, image_filename]
        }
        const {status, stderr} = spawnSync("xz", ["-d", "-k", filename])
        if (status == 0) {
            console.log(`[+] Unarchived ${filename}`)
            renameSync(cheribuild_release_purecap_image_filename, image_filename)
            return [true, image_filename]
        } else {
            console.log(`[!] Failed to unarchive ${filename}`)
            return [false, null]
        }
    }
}

const unarchive_qemu = async (latestTag, filename) => {
    if (filename.endsWith(".xz")) {
        const qemu_rootdir = `qemu-${latestTag}`
        if (existsSync(qemu_rootdir)) {
            console.log(`[-] ${qemu_rootdir} already exists, skipping unarchive`)
            return [true, qemu_rootdir]
        }
        console.log(`[+] Unarchiving ${filename}`)
        const {status, stderr} = spawnSync("tar", ["-xf", filename])
        if (status != 0) {
            console.log(`[!] Failed to unarchive ${filename}: ${stderr}`)
            return [false, null]
        } else {
            console.log(`[+] Unarchived ${filename}`)
            renameSync("sdk", qemu_rootdir)
            return [true, qemu_rootdir]
        }
    }
}

const setup_image_file = async (imageFilename, qemuRootdir) => {
    const setup = (proc) => {
        console.log("[+] Copying setup script")
        spawnSync('scp', [
            '-o StrictHostKeyChecking=no',
            '-q',
            'setupcloudshell.sh',
            'imagesetup:/etc/rc.local',
        ])
        // Execute setup script via ssh
        console.log("[+] Executing setup script")
        spawnSync('ssh', [
            '-o',
            'StrictHostKeyChecking=no',
            'imagesetup',
            'chmod +x /etc/rc.local; /etc/rc.local',
        ], { stdio: ['ignore', 1, 2] })
        if (proc) {
            proc.kill()
        }
    }
    // Spawn qemu with the image file
    if (process.env.NODE_ENV !== 'production') {
        // Skip qemu in dev mode, assume qemu is already running
        setup()
    } else {
        console.log(`[+] Spawning qemu with ${imageFilename}`)
        const qemuProcess = qemuWrapper(`${resolve(qemuRootdir)}/bin/qemu-system-morello`, [
            '-M', 'virt,gic-version=3',
            '-cpu', 'morello',
            '-smp', '4',
            '-bios', 'edk2-aarch64-code.fd',
            '-m', '512M',
            '-nographic',
            '-drive', `if=none,file=${resolve(imageFilename)},id=drv,format=raw`,
            '-device', 'virtio-blk-pci,drive=drv',
            '-device', 'virtio-net-pci,netdev=net0',
            '-netdev', 'user,id=net0,hostfwd=tcp:127.0.0.1:2223-:22',
            '-device', 'virtio-rng-pci'
        ], setup)
    }
}

function update_chericonfig(image_filename, qemu_rootdir) {
    let config = {
        "image": resolve(image_filename),
        "qemu": resolve(qemu_rootdir)
    }
    writeFile("chericonfig.json", JSON.stringify(config), (err) => {
        if (err) {
            console.log(`[!] Failed to write chericonfig.json: ${err}`)
        }
    })
}

const updateImage = async () => {
    console.log("[+] Updating image")
    const [detected, latestTag] = await get_latest_tag()
    if (!detected) return
    console.log(`[+] Latest tag: ${latestTag}`)
    let [downloaded, cache_filename] = await download_image(latestTag)
    if (!downloaded) return

    let [unarchived_image, image_filename] = await unarchive_image(cache_filename)
    if (!unarchived_image) return

    [downloaded, cache_filename] = await download_qemu(latestTag)
    if (!downloaded) return

    let [unarchived_qemu, qemu_rootdir] = await unarchive_qemu(latestTag, cache_filename)
    if (!unarchived_qemu) return

    setup_image_file(image_filename, qemu_rootdir)

    update_chericonfig(image_filename, qemu_rootdir)
}

await updateImage()
