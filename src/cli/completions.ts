import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import chalk from "chalk";

const RAY_DIR = resolve(homedir(), ".ray");

interface ShellInfo {
  name: string;
  rcFile: string;
  cacheFile: string;
  sourceLine: string;
}

function detectShell(): ShellInfo {
  const shell = process.env.SHELL || "";

  if (shell.endsWith("/bash") || shell.endsWith("/bash.exe")) {
    const cacheFile = resolve(RAY_DIR, "completion.bash");
    return {
      name: "bash",
      rcFile: resolve(homedir(), ".bashrc"),
      cacheFile,
      sourceLine: `[ -f "${cacheFile}" ] && source "${cacheFile}"`,
    };
  }

  if (shell.endsWith("/fish") || shell.endsWith("/fish.exe")) {
    const configDir = process.env.XDG_CONFIG_HOME || resolve(homedir(), ".config");
    const cacheFile = resolve(RAY_DIR, "completion.fish");
    return {
      name: "fish",
      rcFile: resolve(configDir, "fish", "config.fish"),
      cacheFile,
      sourceLine: `[ -f "${cacheFile}" ] && source "${cacheFile}"`,
    };
  }

  // Default: zsh
  const cacheFile = resolve(RAY_DIR, "completion.zsh");
  return {
    name: "zsh",
    rcFile: resolve(homedir(), ".zshrc"),
    cacheFile,
    sourceLine: `[[ -f "${cacheFile}" ]] && source "${cacheFile}"`,
  };
}

const COMMANDS = [
  { name: "setup", desc: "Configure Ray (API keys, preferences)" },
  { name: "sync", desc: "Sync transactions from linked banks" },
  { name: "link", desc: "Link a new financial account via Plaid" },
  { name: "accounts", desc: "Show accounts and balances" },
  { name: "status", desc: "Show financial overview" },
  { name: "transactions", desc: "Show recent transactions" },
  { name: "spending", desc: "Show spending breakdown" },
  { name: "budgets", desc: "Show budget statuses" },
  { name: "goals", desc: "Show financial goals" },
  { name: "score", desc: "Show daily financial score and streaks" },
  { name: "alerts", desc: "Show financial alerts" },
  { name: "bills", desc: "Show upcoming bills" },
  { name: "recap", desc: "Monthly spending recap" },
  { name: "export", desc: "Export data to a backup file" },
  { name: "import", desc: "Restore data from a backup file" },
  { name: "billing", desc: "Manage your Ray subscription" },
  { name: "update", desc: "Update Ray to the latest version" },
  { name: "doctor", desc: "Check system health" },
];

const SPENDING_PERIODS = ["this_month", "last_month", "last_30", "last_90"];

function generateZsh(): string {
  const cmds = COMMANDS.map(c => `'${c.name}:${c.desc.replace(/'/g, "'\\''")}'`).join("\n    ");
  const periods = SPENDING_PERIODS.map(p => `'${p}'`).join(" ");
  return `_ray() {
  local -a commands
  commands=(
    ${cmds}
  )

  _arguments -C \\
    '1:command:->cmd' \\
    '*::arg:->args'

  case $state in
    cmd)
      _describe 'command' commands
      ;;
    args)
      case $words[1] in
        spending)
          _values 'period' ${periods}
          ;;
        transactions)
          _arguments \\
            '-n[Number of transactions]:limit:' \\
            '--limit[Number of transactions]:limit:' \\
            '-c[Filter by category]:category:' \\
            '--category[Filter by category]:category:' \\
            '-m[Filter by merchant]:merchant:' \\
            '--merchant[Filter by merchant]:merchant:'
          ;;
        export)
          _files
          ;;
        import)
          _files
          ;;
      esac
      ;;
  esac
}

compdef _ray ray
`;
}

function generateBash(): string {
  const names = COMMANDS.map(c => c.name).join(" ");
  const periods = SPENDING_PERIODS.join(" ");
  return `# ray bash completions
_ray_completions() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${names}"

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
    return 0
  fi

  case "\${COMP_WORDS[1]}" in
    spending)
      COMPREPLY=( $(compgen -W "${periods}" -- "$cur") )
      ;;
    transactions)
      COMPREPLY=( $(compgen -W "-n --limit -c --category -m --merchant" -- "$cur") )
      ;;
    export|import)
      COMPREPLY=( $(compgen -f -- "$cur") )
      ;;
  esac
  return 0
}

complete -F _ray_completions ray
`;
}

function generateFish(): string {
  const lines = COMMANDS.map(c =>
    `complete -c ray -n '__fish_use_subcommand' -a '${c.name}' -d '${c.desc.replace(/'/g, "\\'")}'`
  );
  for (const p of SPENDING_PERIODS) {
    lines.push(`complete -c ray -n '__fish_seen_subcommand_from spending' -a '${p}'`);
  }
  lines.push(
    `complete -c ray -n '__fish_seen_subcommand_from transactions' -s n -l limit -d 'Number of transactions'`,
    `complete -c ray -n '__fish_seen_subcommand_from transactions' -s c -l category -d 'Filter by category'`,
    `complete -c ray -n '__fish_seen_subcommand_from transactions' -s m -l merchant -d 'Filter by merchant'`,
    `complete -c ray -n '__fish_seen_subcommand_from export' -F`,
    `complete -c ray -n '__fish_seen_subcommand_from import' -F`,
  );
  return lines.join("\n") + "\n";
}

export function installCompletions(): void {
  const shell = detectShell();

  if (!existsSync(RAY_DIR)) mkdirSync(RAY_DIR, { recursive: true });

  // Generate completion script
  let script: string;
  switch (shell.name) {
    case "bash":
      script = generateBash();
      break;
    case "fish":
      script = generateFish();
      break;
    default:
      script = generateZsh();
  }

  writeFileSync(shell.cacheFile, script);
  console.log(`Wrote ${shell.name} completions to ${chalk.dim(shell.cacheFile)}`);

  // Check if already sourced in RC file
  if (existsSync(shell.rcFile)) {
    const rc = readFileSync(shell.rcFile, "utf-8");
    if (rc.includes("Ray shell completions") || rc.includes(shell.cacheFile)) {
      console.log(chalk.green("Shell RC already sources completions. Done!"));
      console.log(chalk.dim(`Restart your shell or run: source ${shell.rcFile}`));
      return;
    }
  }

  // Append source line to RC file
  const block = `\n# Ray shell completions\n${shell.sourceLine}\n`;
  appendFileSync(shell.rcFile, block);
  console.log(`Added source line to ${chalk.dim(shell.rcFile)}`);
  console.log(chalk.green("Done!") + chalk.dim(` Restart your shell or run: source ${shell.rcFile}`));
}
