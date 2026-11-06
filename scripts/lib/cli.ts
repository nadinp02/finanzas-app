import { stdin, stdout } from "node:process";
import readline from "node:readline";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

export function loadEnv(): void {
  try {
    process.loadEnvFile();
  } catch {}
}

export function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

/** Pide un valor sin mostrarlo en la terminal. */
export function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  const output = rl as unknown as { _writeToOutput: (text: string) => void };
  let muted = false;
  output._writeToOutput = (text: string) => {
    if (!muted || text.includes("\n")) stdout.write(muted ? "\n" : text);
  };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

export function reportError(error: unknown): never {
  if (error instanceof AppError) {
    console.error(`✖ ${error.message}`);
    for (const message of Object.values(error.fields ?? {})) console.error(`  ${message}`);
  } else if (error instanceof ZodError) {
    for (const issue of error.issues) console.error(`✖ ${issue.message}`);
  } else if (error instanceof Error) {
    console.error(`✖ ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
}
