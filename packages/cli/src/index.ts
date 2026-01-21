#!/usr/bin/env node
import { Command } from "commander";
import { profileCommand } from "./commands/profile.js";
import { migrateCommand } from "./commands/migrate.js";
import { evaluateCommand } from "./commands/evaluate.js";
import "dotenv/config";

const program = new Command();

program
  .name("distill")
  .description("Automatic LLM agent migration from expensive to cheap models")
  .version("0.1.0");

// Register commands
program.addCommand(profileCommand);
program.addCommand(migrateCommand);
program.addCommand(evaluateCommand);

program.parse();
