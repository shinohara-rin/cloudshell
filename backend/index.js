import express from 'express';
import { writeFile, existsSync, mkdirSync, rm, readFileSync } from 'fs'
import { cpus } from 'node:os';
import { createServer } from 'node:http';
import { Server } from 'socket.io'
import pty from "node-pty"
import { spawn } from 'node:child_process';
import qemuWrapper from './qemu-wrapper.js';

const app = express();
const server = createServer(app);
let qemuReady = false

server.listen(3001, '0.0.0.0', () => {
    console.log('server running at http://localhost:3001');
});

app.get('/', (req, res) => {
    res.send('<h1>Hello world</h1>');
});

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 5e6 // 5 MB
})
io.on('connection', (s) => {
    const tempHome = Math.random().toString(36).slice(2, 10)
    if (!qemuReady) {
        s.emit('not-ready')
        s.disconnect()
        return
    }
    const term = pty.spawn('ssh', ['-t', 'cloudshell', `TEMP_HOME=/tmp/${tempHome} bash`])
    s.on('data', (data) => {
        term.write(data)
    })
    s.on('resize', ({ cols, rows }) => {
        term.resize(cols, rows)
    })
    term.onData((data) => {
        s.emit('data', data)
    })
    term.onExit((evt) => {
        s.emit('exit', evt)
        s.disconnect(true)
    })
    s.on('disconnect', () => {
        term.kill(9)
        rm(`/tmp/upload/${tempHome}`, { recursive: true }, () => {
            //idk, probably do nothing
        })
    })
    s.on('upload', ({ file, fileName }, cb) => {
        console.log('recived file:', fileName)
        const validFilename = /^[a-zA-Z0-9_. -]+$/
        if (!validFilename.test(fileName)) {
            cb({ err: "Invalid filename, only alphanumerics, dashes, spaces, dots and underscores allowed." })
            return
        }
        if (!existsSync(`/tmp/upload/${tempHome}`)) {
            mkdirSync(`/tmp/upload/${tempHome}`, { recursive: true })
        }
        writeFile(`/tmp/upload/${tempHome}/${fileName}`, file, (err) => {
            console.log("writeFile:", err)
            if (err) {
                cb(err)
                return
            }
            console.log('spawning scp')
            const sshUpload = spawn('scp', [`/tmp/upload/${tempHome}/${fileName}`, `cloudshell:/tmp/${tempHome}/`])
            sshUpload.on('close', (code) => {
                console.log('scp exited with', code)
                cb(code)
            })
        })
    })
})

// read qemuRoot from chericonfig.json

const configPath = 'chericonfig.json';
if (!existsSync(configPath)) {
    console.error(`Config file ${configPath} does not exist.`);
    process.exit(1);
}
let config = JSON.parse(readFileSync(configPath, 'utf8'));

const qemuCmd = `${config.qemu}/bin/qemu-system-morello`;
const qemuArgs = [
    '-M', 'virt,gic-version=3',
    '-cpu', 'morello',
    '-smp', `${cpus().length}`,
    '-bios', 'edk2-aarch64-code.fd',
    '-m', process.env.MEMORY || '24G',
    '-nographic',
    '-drive', `if=none,file=${config.image},id=drv,format=raw`,
    '-device', 'virtio-blk-pci,drive=drv',
    '-device', 'virtio-net-pci,netdev=net0',
    '-netdev', 'user,id=net0,hostfwd=tcp:127.0.0.1:2222-:22',
    '-device', 'virtio-rng-pci'
];

function startQemu() {
    qemuWrapper(qemuCmd, qemuArgs, () => {
    qemuReady = true
    }, (code) => {
        console.log('qemu exited with code', code, "restarting...")
        qemuReady = false
        setImmediate(startQemu)
    })
}

startQemu()