import fs from "fs";
import path from "path";

export class Logger {
  private logDir: string;

  constructor() {
    this.logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatTime(): string {
    const now = new Date();
    return now.toLocaleTimeString();
  }

  private getLogFilename(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}.txt`;
  }

  private stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
  }

  private writeToFile(level: string, msg: string, args: unknown[]): void {
    const filePath = path.join(this.logDir, this.getLogFilename());
    let fileMsg = `[${this.formatTime()}] [${level}] ${this.stripAnsi(msg)}`;
    
    if (args.length > 0) {
      const argsStr = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");
      fileMsg += ` ${this.stripAnsi(argsStr)}`;
    }
    
    fileMsg += "\n";
    fs.appendFileSync(filePath, fileMsg);
  }

  info(msg: string, ...args: unknown[]): void {
    console.log(`\x1b[36m[${this.formatTime()}] [INFO]\x1b[0m ${msg}`, ...args);
    this.writeToFile("INFO", msg, args);
  }

  success(msg: string, ...args: unknown[]): void {
    console.log(`\x1b[32m[${this.formatTime()}] [SUCCESS]\x1b[0m ${msg}`, ...args);
    this.writeToFile("SUCCESS", msg, args);
  }

  warn(msg: string, ...args: unknown[]): void {
    console.warn(`\x1b[33m[${this.formatTime()}] [WARN]\x1b[0m ${msg}`, ...args);
    this.writeToFile("WARN", msg, args);
  }

  error(msg: string, ...args: unknown[]): void {
    console.error(`\x1b[31m[${this.formatTime()}] [ERROR]\x1b[0m ${msg}`, ...args);
    this.writeToFile("ERROR", msg, args);
  }

  step(msg: string): void {
    console.log(`\n\x1b[35m=== ${msg} ===\x1b[0m`);
    // Adiciona uma quebra de linha visual também no log para separar os passos
    fs.appendFileSync(path.join(this.logDir, this.getLogFilename()), "\n");
    this.writeToFile("STEP", `=== ${msg} ===`, []);
  }

  debug(msg: string, ...args: unknown[]): void {
    if (process.env.DEBUG) {
      console.debug(`\x1b[90m[${this.formatTime()}] [DEBUG] ${msg}\x1b[0m`, ...args);
      this.writeToFile("DEBUG", msg, args);
    }
  }

  // Novo método específico para escrever os logs brutos que vêm da CLI (Claude/Gemini)
  agentOutput(agent: string, isError: boolean, data: string): void {
    const rawText = data.toString();
    const prefix = `[${agent.toUpperCase()}${isError ? " ERROR" : ""}]`;
    
    // Imprime no console mantendo a formatação e as cores da CLI originais (+ prefixo)
    const color = isError ? "\x1b[31m" : "\x1b[90m";
    const outStream = isError ? process.stderr : process.stdout;
    outStream.write(`${color}${prefix}\x1b[0m ${rawText}`);

    // Salva no arquivo limpo de cores ANSI
    const filePath = path.join(this.logDir, this.getLogFilename());
    const cleanText = this.stripAnsi(rawText);
    
    // Como a saída do agente pode ser stream fragmentado, só injetamos o log puro sem [DATA/HORA] a cada pedaço, 
    // ou adicionamos o prefixo. Vamos colocar o prefixo puro.
    fs.appendFileSync(filePath, `${prefix} ${cleanText}`);
  }
}

export function createLogger(): Logger {
  return new Logger();
}
