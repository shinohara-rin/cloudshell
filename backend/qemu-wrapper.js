import { spawn } from 'child_process'

export default function qemuWrapper(qemuCmd, qemuArgs, readyCb,exitedCb) {
    console.log('starting qemu process with command: ' + qemuCmd + ' ' + qemuArgs.join(' '));
    const qemuProcess = spawn(qemuCmd, qemuArgs);

    let waitForLogin = (() => {
        let concat = ''
        return (data) => {
            concat += data.toString()
            if (concat.includes('login')) {
                readyCb(qemuProcess)
                waitForLogin = () => { }
            }
        }
    })()

    qemuProcess.stdout.on('data', (data) => {
        waitForLogin(data)
    });

    qemuProcess.on('close', (code) => {
        exitedCb(code)
    });

    return qemuProcess
}
