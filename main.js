import "./style.css";
import { Terminal } from "xterm";
import { WebLinksAddon } from "xterm-addon-web-links";
import { CanvasAddon } from "xterm-addon-canvas";
import { FitAddon } from "xterm-addon-fit";
import { io } from "socket.io-client"
import Split from "split.js";

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

window.addEventListener("DOMContentLoaded", function () {
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

  this.document.getElementById('reconnect').addEventListener('click', () => {
    socket.disconnect()
    term.reset()
    socket.connect()
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
    term.write(data)
  })
  socket.on('exit', (evt) => {
    term.write("Process exited with code " + evt.exitCode)
    socket.disconnect()
  })
  term.onResize((evt) => {
    socket.emit('resize', {
      cols: evt.cols,
      rows: evt.rows
    })
  })
});
