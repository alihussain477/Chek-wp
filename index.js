import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import pino from "pino";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: path.join(__dirname, "uploads/") });

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

let waSocket = null;
let authState = null;
let sendInterval = null;

function clearConsole() {
  console.clear();
  console.log(`
   
  AAA               LLLLLLLLLLL             EEEEEEEEEEEEEEEEEEEEEEXXXXXXX       XXXXXXX
 A:::A              L:::::::::L             E::::::::::::::::::::EX:::::X       X:::::X
A:::::A             L:::::::::L             E::::::::::::::::::::EX:::::X       X:::::X
A:::::::A            LL:::::::LL             EE::::::EEEEEEEEE::::EX::::::X     X::::::X
A:::::::::A             L:::::L                 E:::::E       EEEEEEXXX:::::X   X:::::XXX
A:::::A:::::A            L:::::L                 E:::::E                X:::::X X:::::X   
A:::::A A:::::A           L:::::L                 E::::::EEEEEEEEEE       X:::::X:::::X    
A:::::A   A:::::A          L:::::L                 E:::::::::::::::E        X:::::::::X     
A:::::A     A:::::A         L:::::L                 E:::::::::::::::E        X:::::::::X     
A:::::AAAAAAAAA:::::A        L:::::L                 E::::::EEEEEEEEEE       X:::::X:::::X    
A:::::::::::::::::::::A       L:::::L                 E:::::E                X:::::X X:::::X   
A:::::AAAAAAAAAAAAA:::::A      L:::::L         LLLLLL  E:::::E       EEEEEEXXX:::::X   X:::::XXX
A:::::A             A:::::A   LL:::::::LLLLLLLLL:::::LEE::::::EEEEEEEE:::::EX::::::X     X::::::X
A:::::A               A:::::A  L::::::::::::::::::::::LE::::::::::::::::::::EX:::::X       X:::::X
A:::::A                 A:::::A L::::::::::::::::::::::LE::::::::::::::::::::EX:::::X       X:::::X
AAAAAAA                   AAAAAAALLLLLLLLLLLLLLLLLLLLLLLLEEEEEEEEEEEEEEEEEEEEEEXXXXXXX       XXXXXXX
`);
}

async function startSendingMessages(targets, messages, headerName, delaySeconds) {
  while (true) {
    for (const target of targets) {
      try {
        const timestamp = new Date().toLocaleTimeString();
        const text = `${headerName} ${messages.join("\n")}`;
        await waSocket.sendMessage(target + "@c.us", { text });
        console.log(`[Target]: ${target}`);
        console.log(`[Time]: ${timestamp}`);
        console.log(`[Message]: ${text}`);
        console.log("[ALEX TOOL OWNER]");
        await delay(delaySeconds * 1000);
      } catch (err) {
        console.log("Error sending message: " + err.message + ". Retrying...");
        await delay(5000);
      }
    }
  }
}

async function initializeSocket(phoneNumber) {
  authState = await useMultiFileAuthState("./auth_info");
  waSocket = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: authState.state,
  });

  waSocket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      console.log("[Your WhatsApp Login ✓]");
    } else if (
      connection === "close" &&
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
    ) {
      console.log("Connection closed unexpectedly, reconnecting...");
      initializeSocket(phoneNumber);
    } else if (connection === "close") {
      console.log("Connection closed. Please restart.");
    }
  });

  waSocket.ev.on("creds.update", authState.saveCreds);

  if (!waSocket.authState?.creds?.registered) {
    console.log("Please scan QR code on your WhatsApp mobile app.");
  }

  return waSocket;
}

app.get("/", (req, res) => {
  res.render("index", { status: null });
});

app.post(
  "/start",
  upload.single("messageFile"),
  async (req, res) => {
    clearConsole();

    const phoneNumber = req.body.phoneNumber;
    const targetNumbersRaw = req.body.targetNumbers;
    const headerName = req.body.headerName;
    const delaySeconds = parseInt(req.body.delaySeconds);
    const messageFilePath = req.file?.path;

    if (!phoneNumber || !targetNumbersRaw || !headerName || !delaySeconds || !messageFilePath) {
      return res.render("index", { status: "Please fill all fields and upload message file." });
    }

    const targets = targetNumbersRaw.split(",").map((t) => t.trim());

    // Read messages from file
    const messages = fs.readFileSync(messageFilePath, "utf-8").split("\n").filter(Boolean);

    try {
      if (!waSocket) {
        waSocket = await initializeSocket(phoneNumber);
      }
    } catch (e) {
      return res.render("index", { status: "Error initializing WhatsApp connection." });
    }

    // Start sending messages asynchronously (in background)
    if (sendInterval) clearInterval(sendInterval);

    (async () => {
      try {
        await startSendingMessages(targets, messages, headerName, delaySeconds);
      } catch (e) {
        console.log("Error in sending messages:", e);
      }
    })();

    res.render("index", { status: "Message sending started. Check console for logs." });
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
