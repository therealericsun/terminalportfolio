import { commands, isRestrictedCommand, getRestrictedCommandError } from '../data/commands';
import { parseCommandLine, extractCurrentCommand } from '../utils/commandParser';
import type { ParsedCommand } from '../utils/commandParser';

// Available file names for autocomplete (hidden files not included in autocomplete)
const fileNames = ['skills.md', 'projects.md', 'experience.md', 'contact.md'];

const output = document.getElementById('output');
const input = document.getElementById('command-input') as HTMLInputElement;
const commandHistory: string[] = [];
let historyIndex = -1;
let autocompleteElement: HTMLElement | null = null;

function scrollPromptIntoView() {
    input?.scrollIntoView({ block: 'end' });
}

async function executeCommand(cmd: string) {
    const trimmedCmd = cmd.trim();
    
    // Remove autocomplete hint if present
    removeAutocomplete();

    // Display command with colored prompt (command in white text)
    const commandLine = document.createElement('div');
    commandLine.className = 'output-line';
    const promptSpan = document.createElement('span');
    promptSpan.className = 'prompt history-prompt';
    promptSpan.textContent = 'visitor@portfolio:~$';
    commandLine.appendChild(promptSpan);
    commandLine.appendChild(document.createTextNode(cmd));
    output?.appendChild(commandLine);

    // Only execute command if not empty
    if (trimmedCmd !== '') {
        // Add command to history
        commandHistory.unshift(cmd);
        historyIndex = -1;

        // Check for redirection operators (>, >>, <)
        if (/[<>]/.test(trimmedCmd)) {
            addOutput(getRestrictedCommandError('redirection'));
            scrollPromptIntoView();
            return;
        }

        // Parse command line with support for chaining
        const parsedLine = parseCommandLine(trimmedCmd);

        // Execute the command chain
        await executeCommandChain(parsedLine.chains);
    }
    
    // Scroll to bottom
    scrollPromptIntoView();
}

async function executeCommandChain(chains: Array<{ command: ParsedCommand; operator?: string }>) {
    let previousOutput: string | null = null;
    
    for (let i = 0; i < chains.length; i++) {
        const chain = chains[i];
        const parsed = chain.command;
        const operator = chain.operator;
        
        // Check if this command's output will be piped to another command
        const willBePiped = operator === '|';
        
        // Handle pipe operator - pass previous output to next command
        if (i > 0 && chains[i - 1].operator === '|') {
            // For pipe operations, modify the command based on what's being piped
            if (previousOutput !== null) {
                // First check if the command exists
                if (!commands[parsed.command]) {
                    addOutput(`<span class="error">Command not found: ${parsed.command}</span>`);
                    return;
                }
                
                if (parsed.command === 'cowsay' || parsed.command === 'echo') {
                    // Special handling for commands that accept piped input
                    // Strip HTML tags and preserve line breaks from previous output
                    const textOnly = stripHtmlTagsPreserveLineBreaks(previousOutput);
                    const result = await executeSingleCommand(parsed, textOnly);
                    previousOutput = result;
                    
                    // Only display if this is the final command (not being piped further)
                    if (result !== null && !willBePiped) {
                        addOutput(result);
                    }
                } else {
                    // For other commands, piping is not supported
                    addOutput(`<span class="error">Error: Command '${parsed.command}' does not support piped input</span>`);
                    return;
                }
            }
        } else {
            // For non-piped commands (first command, or after ;, &&, ||)
            
            // Check if bonsai is being piped - it doesn't support piping
            if (parsed.command === 'bonsai' && willBePiped) {
                addOutput(`<span class="error">Error: 'bonsai' does not support piping</span>`);
                return;
            }
            
            const result = await executeSingleCommand(parsed);
            previousOutput = result;
            
            // Only display output if it's not being piped to another command
            if (result !== null && !willBePiped) {
                addOutput(result);
            }
        }
        
        // For sequence operators (;, &&, ||), just continue to next command
        // Since we don't really have command failures, they all behave the same
        // In a real terminal, && would only continue on success, || only on failure
    }
}

async function executeSingleCommand(parsed: ParsedCommand, pipedInput?: string): Promise<string | null> {
    // Check for restricted commands first
    if (isRestrictedCommand(parsed.command)) {
        return getRestrictedCommandError(parsed.command);
    }
    
    if (commands[parsed.command]) {
        // If there's piped input, we may need to modify the parsed command
        if (pipedInput !== undefined) {
            // For cowsay and echo, replace args with piped input
            if (parsed.command === 'cowsay' || parsed.command === 'echo') {
                const modifiedParsed = {
                    ...parsed,
                    args: [pipedInput]
                };
                return await commands[parsed.command].execute(modifiedParsed);
            }
        }
        
        return await commands[parsed.command].execute(parsed);
    } else {
        return `<span class="error">Command not found: ${parsed.command}</span>`;
    }
}

function stripHtmlTags(html: string): string {
    // Create a temporary div to parse HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function stripHtmlTagsPreserveLineBreaks(html: string): string {
    // Create a temporary div to parse HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    
    const lines: string[] = [];
    
    // Process each top-level child as a separate line/block
    const processElement = (element: Element): string => {
        let text = '';
        
        // Walk through all child nodes and collect text
        const collectText = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const content = (node.textContent || '').trim();
                if (content) {
                    // Add space before if we already have content
                    if (text && !text.endsWith(' ')) {
                        text += ' ';
                    }
                    text += content;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                // For BR tags, add explicit line break
                if (el.tagName === 'BR') {
                    text += '\n';
                } else {
                    // Process children
                    Array.from(el.childNodes).forEach(child => collectText(child));
                }
            }
        };
        
        collectText(element);
        return text;
    };
    
    // Process each top-level element
    Array.from(tmp.children).forEach(child => {
        const text = processElement(child);
        if (text.trim()) {
            // Split by explicit line breaks (from BR tags)
            const subLines = text.split('\n').map(line => line.trim()).filter(line => line);
            lines.push(...subLines);
        }
    });
    
    // If there are no children, just get the text content
    if (lines.length === 0) {
        const text = tmp.textContent?.trim() || '';
        if (text) {
            lines.push(text);
        }
    }
    
    return lines.join('\n');
}

function addOutput(text: string) {
    const line = document.createElement('div');
    line.className = 'output-line';
    line.innerHTML = text;
    output?.appendChild(line);
    
    // Scroll to bottom
    scrollPromptIntoView();
}

function removeAutocomplete() {
    if (autocompleteElement) {
        autocompleteElement.remove();
        autocompleteElement = null;
    }
}

function showAutocomplete(matches: string[]) {
    removeAutocomplete();
    
    autocompleteElement = document.createElement('div');
    autocompleteElement.className = 'autocomplete-hint';
    autocompleteElement.textContent = matches.join('  ');
    
    const inputLine = document.querySelector('.input-line');
    inputLine?.insertAdjacentElement('afterend', autocompleteElement);
}

// Handle input
input?.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = input.value;
        input.value = '';
        await executeCommand(cmd);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        removeAutocomplete();
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            input.value = commandHistory[historyIndex];
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        removeAutocomplete();
        if (historyIndex > 0) {
            historyIndex--;
            input.value = commandHistory[historyIndex];
        } else {
            historyIndex = -1;
            input.value = '';
        }
    } else if (e.key === 'Tab') {
        e.preventDefault();
        
        // Extract the current command being typed (after last operator)
        const currentCmd = extractCurrentCommand(input.value);
        
        // Check if we're on a new word (trailing space means we finished typing the previous word)
        const hasTrailingSpace = currentCmd !== currentCmd.trimEnd();
        const words = currentCmd.trim().split(/\s+/).filter(w => w.length > 0);
        
        // Check if we're autocompleting a filename (after 'cat' command)
        if (words.length >= 1 && words[0] === 'cat') {
            if (words.length === 1 && hasTrailingSpace) {
                // "cat " - show available files (hidden files not shown in autocomplete)
                showAutocomplete(fileNames);
            } else if (words.length === 2) {
                // "cat ski..." - autocomplete the filename
                const partial = words[1].toLowerCase();
                const matches = fileNames.filter(file => file.toLowerCase().startsWith(partial));
                
                if (matches.length === 1) {
                    // Single match - autocomplete the filename
                    const beforeFilename = input.value.substring(0, input.value.lastIndexOf(words[1]));
                    input.value = beforeFilename + matches[0];
                    removeAutocomplete();
                } else if (matches.length > 1) {
                    // Multiple matches - show them
                    showAutocomplete(matches);
                }
            }
        } else if (words.length === 1 && !hasTrailingSpace) {
            // Autocomplete command names (only if not finishing with a space)
            const partial = words[0].toLowerCase();
            const matches = Object.keys(commands).filter(cmd => cmd.startsWith(partial));
            
            if (matches.length === 1) {
                // Single match - autocomplete it
                // Replace the current command part with the match
                const beforeCmd = input.value.substring(0, input.value.length - currentCmd.length);
                input.value = beforeCmd + matches[0];
                removeAutocomplete();
            } else if (matches.length > 1) {
                // Multiple matches - show them
                showAutocomplete(matches);
            }
        }
    } else {
        // Remove autocomplete on any other key
        removeAutocomplete();
    }
});

// A click first focuses the terminal; once it has the caret, clicks edit Life.
// Capture focus on pointerdown because the browser may blur the input before click.
const interactiveSelector = 'a, button, input, select, textarea, summary, [contenteditable], [role="button"], .background-toolbar, .mnist-card';
let clickIntent: { x: number; y: number; focused: boolean; dragged: boolean } | null = null;

document.addEventListener('pointerdown', (event) => {
    clickIntent = null;
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest(interactiveSelector)) return;
    clickIntent = { x: event.clientX, y: event.clientY, focused: document.activeElement === input, dragged: false };
});
document.addEventListener('pointermove', (event) => {
    if (clickIntent && Math.hypot(event.clientX - clickIntent.x, event.clientY - clickIntent.y) > 6) {
        clickIntent.dragged = true;
    }
});
document.addEventListener('pointercancel', () => { clickIntent = null; });
document.addEventListener('click', (event) => {
    const intent = clickIntent;
    clickIntent = null;
    if (event.defaultPrevented || event.button !== 0 || (event.target as Element).closest(interactiveSelector)) return;
    if (intent?.dragged || window.getSelection()?.toString() || input?.disabled) return;
    input?.focus({ preventScroll: true });
    if (intent?.focused && document.body.dataset.background === 'life') {
        document.dispatchEvent(new CustomEvent('life:toggle', { detail: { x: event.clientX, y: event.clientY } }));
    }
});

// Do not open a mobile keyboard before the visitor chooses to type.
if (window.matchMedia('(pointer: fine)').matches) input?.focus({ preventScroll: true });

// Auto-update copyright year
const yearElement = document.getElementById('current-year');
if (yearElement) {
    yearElement.textContent = new Date().getFullYear().toString();
}
