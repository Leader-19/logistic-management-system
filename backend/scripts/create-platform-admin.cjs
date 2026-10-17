const { pbkdf2, randomBytes } = require("node:crypto");
const { promisify } = require("node:util");
const { createInterface } = require("node:readline");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const deriveKey = promisify(pbkdf2);

function ask(prompt) {
  return new Promise((resolve) => {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    readline.question(prompt, (answer) => {
      readline.close();
      resolve(answer.trim());
    });
  });
}

function askSecret(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
      reject(new Error("Run this command in an interactive terminal so the password can be entered without echo."));
      return;
    }
    let value = "";
    process.stdout.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("Cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    };
    input.on("data", onData);
  });
}

async function passwordHash(password) {
  const iterations = 310_000;
  const salt = randomBytes(16).toString("hex");
  const hash = (await deriveKey(password, salt, iterations, 32, "sha256")).toString("hex");
  return `${iterations}:${salt}:${hash}`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in the root .env before running this command.");
  const fullName = await ask("Platform admin full name: ");
  const email = (await ask("Platform admin email: ")).toLowerCase();
  if (fullName.length < 2 || fullName.length > 120) throw new Error("Name must be 2 to 120 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
  const password = await askSecret("Password (12 to 128 characters, hidden): ");
  const confirmation = await askSecret("Confirm password (hidden): ");
  if (password.length < 12 || password.length > 128) throw new Error("Password must be 12 to 128 characters.");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  if (await prisma.user.count({ where: { isPlatformAdmin: true } })) {
    throw new Error("A platform administrator already exists. This command is only for the first account bootstrap.");
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new Error("That email already exists. This bootstrap command only creates a new account.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, fullName, passwordHash: await passwordHash(password), isPlatformAdmin: true },
      select: { id: true, email: true, fullName: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "platform.admin.provisioned",
        targetType: "user",
        targetId: user.id,
        metadata: { method: "one-time CLI bootstrap" },
      },
    });
    return user;
  });
  console.log(`Created platform administrator ${created.email} (${created.fullName}).`);
  console.log("Sign in with this account to open /platform. Store the password in your approved secret manager.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Platform administrator setup failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
