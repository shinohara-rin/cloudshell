import { spawn } from 'child_process'

export default function qemuWrapper(qemuCmd, qemuArgs, readyCb) {
    console.log('starting qemu process with command: ' + qemuCmd + ' ' + qemuArgs.join(' '));
    const qemuProcess = spawn(qemuCmd, qemuArgs);

    let waitForLogin = (() => {
        let concat = ''
        return (data) => {
            concat += data.toString()
            if (concat.includes('login')) {
                readyCb()
                waitForLogin = () => { }
            }
        }
    })()

    qemuProcess.stdout.on('data', (data) => {
        waitForLogin(data)
    });

    qemuProcess.on('close', (code) => {
        console.log(`qemu exited with code ${code}`);
    });

    return qemuProcess
}
