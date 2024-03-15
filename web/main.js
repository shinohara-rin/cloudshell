import "./style.css";
import { Terminal } from "xterm";
import { WebLinksAddon } from "xterm-addon-web-links";
import { CanvasAddon } from "xterm-addon-canvas";
import { FitAddon } from "xterm-addon-fit";
import { io } from "socket.io-client"
import Split from "split.js";

let c;

const theme = {
  background: "#000000",
  foreground: "#ffffff",
  cursor: "#ffffff",
  cursorAccent: "#000000",
  selection: "rgba(255, 255, 255, 0.3)",
  black: "#000000",
  red: "#ff0000",
  green: "#00ff00",
  yellow: "#ffff00",
  blue: "#0000ff",
  magenta: "#ff00ff",
  cyan: "#00ffff",
  white: "#ffffff",
  brightBlack: "#808080",
  brightRed: "#ff0000",
  brightGreen: "#00ff00",
  brightYellow: "#ffff00",
  brightBlue: "#0000ff",
  brightMagenta: "#ff00ff",
  brightCyan: "#00ffff",
  brightWhite: "#ffffff",

  // Define styles for extended ANSI escape sequences (16-255)
  extendedAnsi: (() => {
    const extendedAnsi = {};

    for (let i = 16; i <= 255; i++) {
      // Calculate the corresponding RGB values for each index This calculation is
      // based on the xterm 256-color palette formula
      const colorIndex = i - 16;
      const r = Math.floor(colorIndex / 36) * 51;
      const g = Math.floor((colorIndex % 36) / 6) * 51;
      const b = (colorIndex % 6) * 51;

      const color = `#${r.toString(16).padStart(2, "0")}${g
        .toString(16)
        .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      extendedAnsi[i.toString()] = { color };
    }

    return extendedAnsi;
  })(),
}

function showUpload() {
  document.getElementById('uploading').style.visibility = 'visible'
}

function hideUpload() {
  document.getElementById('uploading').style.visibility = 'hidden'
}

window.addEventListener("DOMContentLoaded", function () {
  this.document.getElementsByClassName('closebtn')[0].addEventListener('click', hidePopup);
  Split(["#webpage", "#terminal"]);
  var term = new Terminal({
    rows: 24,
    cols: 80,
    allowProposedApi: true,
    allowTransparency: true,
    theme: theme,
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(document.getElementById("terminal"));
  term.loadAddon(new CanvasAddon());
  fitAddon.fit();
  let sizeUpdated = false

  this.document.getElementById('reconnect').addEventListener('click', () => {
    sizeUpdated = false
    socket.disconnect()
    term.reset()
    socket.connect()
  })
  this.document.getElementById('feedback').addEventListener('click', () => {
    // TODO
  })

  const term_resize_ob = new ResizeObserver((entries) => {
    try {
      fitAddon && fitAddon.fit();
    } catch (err) {
      console.log(err);
    }
  });
  term_resize_ob.observe(document.getElementById("terminal"));

  const socket = io("wss://cloudshell.cheri.run")
  term.write('connecting to server...')
  const connectingHint = setInterval(() => {
    if (socket.connected) {
      clearInterval(connectingHint)
      return
    }
    term.write('.')
  }, 1000);
  socket.on('connect', () => {
    term.writeln("Connected to socket.io server!")
  })
  socket.connect()
  term.onData((data) => {
    socket.emit('data', data)
  })
  socket.on('not-ready', () => {
    term.writeln("The host server is still starting. Please try again later.")
  })
  socket.on('data', (data) => {
    if (!sizeUpdated) {
      socket.emit('resize', {
        cols: term.cols,
        rows: term.rows
      })
      sizeUpdated = true
    }
    checkForMissingCommand(data.toString())
    term.write(data)
  })
  socket.on('exit', (evt) => {
    term.write("Process exited with code " + evt.exitCode)
    sizeUpdated = false
    socket.disconnect()
  })
  term.onResize((evt) => {
    socket.emit('resize', {
      cols: evt.cols,
      rows: evt.rows
    })
  })

  // set up drag to upload
  const elem = document.getElementById("terminal")
  elem.addEventListener('dragenter', (e) => {
    if (!elem.classList.contains('dropzone-active'))
      elem.classList.add('dropzone-active')
  })

  elem.addEventListener('dragleave', (e) => {
    e.preventDefault()
    if (elem.classList.contains('dropzone-active'))
      elem.classList.remove('dropzone-active')
  })

  elem.addEventListener('dragover', (e) => {
    e.preventDefault()
  })

  elem.addEventListener('drop', (e) => {
    e.preventDefault()
    elem.classList.remove('dropzone-active')
    const file = e.dataTransfer.files[0]
    const fileName = file.name
    console.log('dropped file', fileName)
    if (file.size > 5 * 1024 * 1024) {
      this.alert("File too large. Max upload size is 5MB, your file is " + (file.size / 1024 / 1024).toFixed(2) + "MB")
      return
    }
    showUpload()
    socket.emit('upload', { file, fileName: file.name }, (result) => {
      hideUpload()
      console.log("upload result", result)
      if (result == 0) {
        this.alert(`${fileName} was uploaded to your home directory`)
      } else {
        if (result.err) {
          this.alert(result.err)
        }
      }
    })
    console.log('uploading', fileName)
  })

});

function checkForMissingCommand(str){
  if(localStorage.getItem('noPopup')){
    return
  }
  let r = /bash:(.*?): command not found/
  let match = str.match(r)
  if(match){
    console.log(match[1])
    // show popup
    document.getElementById('missing-command').innerText = match[1]
    let popup = document.getElementsByClassName('popup')[0]
    popup.classList.add('visible')
    popup.classList.remove('hidden')

    setTimeout(() => {
      let popup = document.getElementsByClassName('popup')[0]
      popup.classList.add('hidden')
      popup.classList.remove('visible')
    }, 5000);
  }
}

function hidePopup(){
  let popup = document.getElementsByClassName('popup')[0]
  popup.classList.add('hidden')
  popup.classList.remove('visible')
  localStorage.setItem('noPopup', true)
}