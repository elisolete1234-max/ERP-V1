import net from "node:net";
import tls from "node:tls";

type ResetEmailInput = {
  to: string;
  resetUrl: string;
  expiresMinutes: number;
};

type SmtpConfig = {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
};

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) {
    return null;
  }

  const parsedPort = Number(process.env.SMTP_PORT?.trim() || "587");
  return {
    host,
    port: Number.isFinite(parsedPort) ? parsedPort : 587,
    user: process.env.SMTP_USER?.trim() || undefined,
    pass: process.env.SMTP_PASS?.trim() || undefined,
    from,
  };
}

function escapeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function buildResetEmail(input: ResetEmailInput, from: string) {
  const subject = "Restablecer contrasena de Eli Print 3D";
  const text = [
    "Eli Print 3D",
    "",
    "Hemos recibido una solicitud para restablecer tu contrasena.",
    `Abre este enlace para crear una nueva contrasena: ${input.resetUrl}`,
    "",
    `El enlace caduca en ${input.expiresMinutes} minutos y solo puede usarse una vez.`,
    "Si no has solicitado este cambio, puedes ignorar este email.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h1 style="font-size:20px;margin:0 0 16px">Eli Print 3D</h1>
      <p>Hemos recibido una solicitud para restablecer tu contrasena.</p>
      <p>
        <a href="${input.resetUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">
          Restablecer contrasena
        </a>
      </p>
      <p>El enlace caduca en ${input.expiresMinutes} minutos y solo puede usarse una vez.</p>
      <p>Si no has solicitado este cambio, puedes ignorar este email.</p>
    </div>
  `.trim();
  const boundary = `eli-print-${Date.now().toString(36)}`;

  return [
    `From: ${escapeHeader(from)}`,
    `To: ${escapeHeader(input.to)}`,
    `Subject: ${escapeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function readLine(socket: net.Socket) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (/\r?\n$/.test(buffer) && !/^\d{3}-/m.test(buffer.split(/\r?\n/).at(-2) ?? "")) {
        socket.off("data", onData);
        resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

async function command(socket: net.Socket, line: string, expected: number[]) {
  socket.write(`${line}\r\n`);
  const response = await readLine(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) {
    throw new Error(`SMTP rechazo ${line.split(" ")[0]}: ${response.trim()}`);
  }
  return response;
}

async function openSmtpSocket(config: SmtpConfig) {
  const socket = config.port === 465
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.connect({ host: config.host, port: config.port });
  await readLine(socket);
  await command(socket, `EHLO ${config.host}`, [250]);

  if (config.port !== 465) {
    await command(socket, "STARTTLS", [220]);
    const secureSocket = tls.connect({ socket, servername: config.host });
    await command(secureSocket, `EHLO ${config.host}`, [250]);
    return secureSocket;
  }

  return socket;
}

export async function sendPasswordResetEmail(input: ResetEmailInput) {
  const config = getSmtpConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      console.error("SMTP no configurado para recuperacion de contrasena.");
      throw new Error("El envio de email no esta configurado.");
    }

    console.info(`[Eli Print 3D] Enlace local de recuperacion para ${input.to}: ${input.resetUrl}`);
    return { delivered: false, mode: "console" as const };
  }

  const socket = await openSmtpSocket(config);
  try {
    if (config.user && config.pass) {
      await command(socket, "AUTH LOGIN", [334]);
      await command(socket, Buffer.from(config.user).toString("base64"), [334]);
      await command(socket, Buffer.from(config.pass).toString("base64"), [235]);
    }
    await command(socket, `MAIL FROM:<${config.from}>`, [250]);
    await command(socket, `RCPT TO:<${input.to}>`, [250, 251]);
    await command(socket, "DATA", [354]);
    socket.write(`${buildResetEmail(input, config.from)}\r\n.\r\n`);
    const dataResponse = await readLine(socket);
    if (Number(dataResponse.slice(0, 3)) !== 250) {
      throw new Error(`SMTP rechazo DATA: ${dataResponse.trim()}`);
    }
    await command(socket, "QUIT", [221]);
    return { delivered: true, mode: "smtp" as const };
  } finally {
    socket.destroy();
  }
}
