import { generateBonsai } from '../utils/bonsai';
import { getFortune } from '../utils/fortune';
import { cowsay } from '../utils/cowsay';
import type { ParsedCommand } from '../utils/commandParser';

export interface Command {
    description: string;
    execute: (parsed?: ParsedCommand) => string | null | Promise<string | null>;
}

// File system mapping - lazy loaded to avoid circular dependency
const getFileSystem = (): Record<string, () => string | null | Promise<string | null>> => ({
    'skills.md': () => commands.skills.execute(),
    'projects.md': () => commands.projects.execute(),
    'experience.md': () => commands.experience.execute(),
    'contact.md': () => commands.contact.execute(),
});

// Hidden files only shown with ls -a
const hiddenFiles: Record<string, () => string | null | Promise<string | null>> = {
    '.easter_egg.txt': () => `<pre style="font-family: inherit; line-height: 1.2; white-space: pre; margin: 5px 0;">     /\`\\   /\`\\
    (/\\ \\-/ /\\)
       )6 6(
     &gt;{= Y =}&lt;
      /'-^-'\\
     (_)""-(_).
    /*  ((*   *'.
   |   *))  *   *\\
   | *  ((*   *  /
    \\  *))  *  .'
     '-.((*_.-'

ASCII art by Joan Stark (Spunk)

Congratulations, you found the secret easter egg!</pre>`
};

// Restricted commands that should show a funny error
const restrictedCommands = ['sudo', 'cd', 'rm', 'touch', 'mv', 'cp', 'mkdir', 'rmdir', 'chmod', 'chown'];

export const commands: Record<string, Command> = {
    help: {
        description: 'Display available commands',
        execute: () => {
            return `<div class="panel-box">` +
  `<span class="section-heading">Shortcuts:</span><br>` +
  `<div class="help-item"><span class="command">skills</span><span class="help-dash">-</span><span class="help-desc">View my technical skills</span></div>` +
  `<div class="help-item"><span class="command">projects</span><span class="help-dash">-</span><span class="help-desc">See my projects</span></div>` +
  `<div class="help-item"><span class="command">experience</span><span class="help-dash">-</span><span class="help-desc">View my work experience</span></div>` +
  `<div class="help-item"><span class="command">contact</span><span class="help-dash">-</span><span class="help-desc">Get my contact information</span></div></div>` +
  `<div class="panel-box">` +
  `<span class="section-heading">Commands:</span><br>` +
  `<div class="help-item"><span class="command">ls</span><span class="help-dash">-</span><span class="help-desc">List available files</span></div>` +
  `<div class="help-item"><span class="command">cat</span><span class="help-dash">-</span><span class="help-desc">Display file contents (usage: cat [file])</span></div>` +
  `<div class="help-item"><span class="command">echo</span><span class="help-dash">-</span><span class="help-desc">Print text to output (usage: echo [text])</span></div>` +
  `<div class="help-item"><span class="command">pwd</span><span class="help-dash">-</span><span class="help-desc">Print working directory</span></div>` +
  `<div class="help-item"><span class="command">bonsai</span><span class="help-dash">-</span><span class="help-desc">Generate an ASCII bonsai inspired by cbonsai (-s to set seed) [<a href="https://github.com/mhzawadi/homebrew-cbonsai" target="_blank">info</a>]</span></div>` +
  `<div class="help-item"><span class="command">fortune</span><span class="help-dash">-</span><span class="help-desc">Display a random programming quote [<a href="https://en.wikipedia.org/wiki/Fortune_(Unix)" target="_blank">info</a>]</span></div>` +
  `<div class="help-item"><span class="command">cowsay</span><span class="help-dash">-</span><span class="help-desc">Make a cow say something (usage: cowsay [message]) [<a href="https://en.wikipedia.org/wiki/Cowsay" target="_blank">info</a>]</span></div>` +
  `<div class="help-item"><span class="command">clear</span><span class="help-dash">-</span><span class="help-desc">Clear the terminal</span></div>` +
  `<div class="help-item"><span class="command">help</span><span class="help-dash">-</span><span class="help-desc">Display this help message</span></div></div>` +
  `<div style="margin-top: 5px; margin-bottom: 10px;"><span class="tab-hint">Tip: Chain commands with | (pipe), && (and), || (or), and ; (sequence). For example, skills | cowsay.</span></div>`;
        }
    },
    skills: {
        description: 'List technical skills',
        execute: () => {
            return `<div class="panel-box"><span class="section-heading">Programming & Markup Languages:</span> ` +
                `Python, C++, C, Javascript / Typescript, FORTRAN, LaTeX, HTML, CSS, SQL</div>` +
                `<div class="panel-box"><span class="section-heading">Libraries:</span> ` +
                `PyTorch, TensorFlow, Scikit-learn, Pandas, Polars, OpenCV, NumPy, SciPy, Sphinx, Matplotlib, ` +
                `Selenium, FastAPI, FastMCP, SQLalchemy, Prefect, MyPy, Ruff, Pydantic, Pybind11, ` +
                `Astro, Express, React</div>` +
                `<div class="panel-box"><span class="section-heading">Tools:</span> ` +
                `Git, Docker, PostgreSQL, MySQL, Slurm, Kubernetes, Jupyter, GitHub Actions, AWS (Bedrock, Lambda, EC2, S3, OpenSearch, ` +
                `Aurora, Neptune)</div>`;
        }
    },
    projects: {
        description: 'Show project portfolio',
        execute: () => {
            return `<div class="panel-box"><span class="section-heading">Terminal Style Portfolio Site</span><br>` +
                `A minimalistic and fully interactive terminal-style portfolio website built with Typescript, Astro, and vanilla CSS. You're looking at it right now.<br>` +
                `<a href="https://github.com/therealericsun/TerminalPortfolio" target="_blank">→ View on GitHub</a></div>` +
                `<div class="panel-box"><span class="section-heading">FLASH: An Extremely Fast Self-Consistent Field Solver</span><br>` +
                `High-performance solver for the radial Schrödinger and Dirac equations written in C++ with Python bindings. (Coming Soon!)</div>` +
                `<div class="panel-box"><span class="section-heading">OPIUM: Open Source Pseudopotential Generator</span><br>` +
                `Primary developer (2023-2025) of one of the most widely used computational chemistry tools. Generates norm-conserving pseudopotentials using FORTRAN, only code in the world that supports generating pseudopotentials for hybrid and range-separated hybrid functionals.<br>` +
                `<a href="https://github.com/rappegroup/opium" target="_blank">→ View Github fork</a><br>` +
                `<a href="https://opium-psp.readthedocs.io/en/latest/" target="_blank">→ View project website</a></div>` +
                `<div class="panel-box"><span class="section-heading">DeepARPES: Convolutional Autoencoders for Photoemission Spectroscopy</span><br>` +
                `Machine learning pipeline for unsupervised analysis of experimental Angle-Resolved Photoemission Spectroscopy (ARPES) data, trained on tight-binding models. Built in Python with Tensorflow.<br>` +
                `<a href="https://github.com/therealericsun/deeparpes" target="_blank">→ View on GitHub</a><br>` + 
                `<a href="https://ieeexplore.ieee.org/abstract/document/10002223" target="_blank">→ View publication</a></div>`;
        }
    },
    contact: {
        description: 'Display contact information',
        execute: () => {
            return `<div class="panel-box">Email:    <a href="mailto:ericsun@seas.upenn.edu" target="_blank">ericsun@seas.upenn.edu</a><br>` +
                `GitHub:   <a href="https://github.com/therealericsun" target="_blank">https://github.com/therealericsun</a><br>` +
                `LinkedIn: <a href="https://www.linkedin.com/in/eric-sun-a323461a0/" target="_blank">https://www.linkedin.com/in/eric-sun-a323461a0/</a></div>`;
        }
    },
    experience: {
        description: 'Show work experience',
        execute: () => {
            return `<div class="panel-box"><span class="section-heading">University of Pennsylvania · Rappe Group Researcher</span><br>` +
                `<span class="tab-hint">Nov 2023 - Present · Philadelphia, PA</span><br>` +
                `Pseudopotential theory under professor Andrew M. Rappe, development of new numeric solvers for computational physics problems.</div>` +
                `<div class="panel-box"><span class="section-heading">Amazon Web Services (AWS) · Software Engineer Intern</span><br>` +
                `<span class="tab-hint">May 2025 - Aug 2025 · San Francisco, CA</span><br>` +
                `Generative ML models for science at the Caltech and AWS center for quantum computing.</div>` +
                `<div class="panel-box"><span class="section-heading">Stanford University · Virtual Reality and Visual Computing Group Researcher</span><br>` +
                `<span class="tab-hint">Jan 2022 - Mar 2023 · Stanford, CA</span><br>` +
                `Neural radiance fields (NeRFs) development under ShanghaiTech University professor Jingyi Yu and Stanford PhD candidate Kevin Fry.</div>` +
                `<div class="panel-box"><span class="section-heading">Yale University · BCT326 Group Researcher</span><br>` +
                `<span class="tab-hint">Mar 2022 - Sep 2022 · New Haven, CT</span><br>` +
                `Automated the processing of spectroscopy data with convolutional autoencoders. Also was a guest instructor for the Pathways to Science summer program.</div>`;
        }
    },
    bonsai: {
        description: 'Generate a random ASCII bonsai tree (use -s <seed> for specific tree)',
        execute: async (parsed?: ParsedCommand) => {
            // Disable input during animation
            const input = document.getElementById('command-input') as HTMLInputElement;
            const inputLine = document.querySelector('.input-line') as HTMLElement;
            
            if (input) input.disabled = true;
            if (inputLine) inputLine.style.display = 'none';
            
            try {
                // Get seed from flags or generate random one
                let seed: number;
                if (parsed?.flags?.s) {
                    const seedStr = parsed.flags.s;
                    if (typeof seedStr !== 'string') {
                        // Flag provided without value
                        const output = document.getElementById('output');
                        if (output) {
                            const errorLine = document.createElement('div');
                            errorLine.className = 'output-line';
                            errorLine.innerHTML = `<span class="error">Error: -s flag requires a numeric seed value</span>`;
                            output.appendChild(errorLine);
                        }
                        return null;
                    }
                    
                    seed = parseInt(seedStr, 10);
                    if (isNaN(seed)) {
                        // Invalid number provided
                        const output = document.getElementById('output');
                        if (output) {
                            const errorLine = document.createElement('div');
                            errorLine.className = 'output-line';
                            errorLine.innerHTML = `<span class="error">Error: '${seedStr}' is not a valid integer seed</span>`;
                            output.appendChild(errorLine);
                        }
                        return null;
                    }
                } else {
                    seed = Date.now();
                }
                
                // Display seed before tree
                const output = document.getElementById('output');
                if (output) {
                    const seedLine = document.createElement('div');
                    seedLine.className = 'output-line';
                    seedLine.innerHTML = `<span style="color: #888888">Seed: ${seed}</span>`;
                    output.appendChild(seedLine);
                }
                
                await generateBonsai(seed);
            } finally {
                // Save current scroll position to prevent jump
                const scrollY = window.scrollY;
                
                // Re-enable input after animation
                if (input) {
                    input.disabled = false;
                }
                if (inputLine) inputLine.style.display = 'flex';
                
                // Restore scroll position to prevent jarring jump
                window.scrollTo({
                    top: scrollY,
                    behavior: 'instant'
                });
                
                // Focus input after restoring scroll
                if (input) input.focus();
            }
            
            return null;
        }
    },
    fortune: {
        description: 'Display a random programming quote',
        execute: () => {
            const quote = getFortune();
            return `<div class="panel-box" style="font-style: italic;">${quote}</div>`;
        }
    },
    cowsay: {
        description: 'Make a cow say something',
        execute: (parsed?: ParsedCommand) => {
            let message = 'Moo!';
            
            // Get message from args
            if (parsed?.args && parsed.args.length > 0) {
                message = parsed.args.join(' ');
            }
            
            const cow = cowsay(message);
            return `<pre style="font-family: inherit; font-size: 16px; line-height: 1.2; white-space: pre; margin: 5px 0;">${cow}</pre>`;
        }
    },
    clear: {
        description: 'Clear terminal screen',
        execute: () => {
            const initialContent = document.getElementById('initial-content');
            if (initialContent) {
                const output = document.getElementById('output');
                if (output) {
                    output.innerHTML = initialContent.outerHTML;
                }
            }
            return null;
        }
    },
    ls: {
        description: 'List available files (use -a to show hidden files)',
        execute: (parsed?: ParsedCommand) => {
            const files = Object.keys(getFileSystem());
            
            // Check if -a flag is present to show hidden files
            if (parsed?.flags?.a) {
                const hiddenFileNames = Object.keys(hiddenFiles);
                return [...files, ...hiddenFileNames].join('  ');
            }
            
            return files.join('  ');
        }
    },
    cat: {
        description: 'Display file contents',
        execute: async (parsed?: ParsedCommand) => {
            if (!parsed?.args || parsed.args.length === 0) {
                return `<span class="error">cat: missing file operand</span>`;
            }
            
            const filename = parsed.args[0];
            const fileSystem = getFileSystem();
            
            // Check regular files first
            if (fileSystem[filename]) {
                return await fileSystem[filename]();
            }
            
            // Check hidden files
            if (hiddenFiles[filename]) {
                return await hiddenFiles[filename]();
            }
            
            return `<span class="error">cat: ${filename}: No such file or directory</span>`;
        }
    },
    echo: {
        description: 'Print text to output',
        execute: (parsed?: ParsedCommand) => {
            if (!parsed?.args || parsed.args.length === 0) {
                return '';
            }
            
            const text = parsed.args.join(' ');
            // Split by newlines and wrap each line separately
            const lines = text.split('\n');
            return lines.join('\n');
        }
    },
    pwd: {
        description: 'Print working directory',
        execute: () => {
            return '/home/portfolio';
        }
    },
};

// Export function to check for restricted commands
export function isRestrictedCommand(cmd: string): boolean {
    return restrictedCommands.includes(cmd);
}

export function getRestrictedCommandError(cmd: string): string {
    const messages = [
        `Nice try! But you can't do that here.`,
        `Whoa there! You can't do that here. Try 'help' instead.`,
        `Nope! That's off-limits. Is that how you treat somebody else's server?`,
    ];
    
    // Pick a random message
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    return `<span class="error">${cmd}: ${randomMessage}</span>`;
}
