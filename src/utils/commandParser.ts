// Command parser utility

export interface ParsedCommand {
    command: string;
    args: string[];
    flags: Record<string, string | boolean>;
}

export interface PipedCommands {
    isPiped: boolean;
    commands: ParsedCommand[];
}

export function parseCommand(input: string): ParsedCommand {
    const trimmed = input.trim();
    const parts = trimmed.split(/\s+/);
    
    const command = parts[0]?.toLowerCase() || '';
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};
    
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        
        if (part.startsWith('-')) {
            // Handle flags
            const flagName = part.replace(/^-+/, '');
            
            // Check if next part is a value (not another flag)
            if (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
                flags[flagName] = parts[i + 1];
                i++; // Skip next part since we used it as value
            } else {
                flags[flagName] = true;
            }
        } else {
            args.push(part);
        }
    }
    
    return { command, args, flags };
}

export function parsePipedCommand(input: string): PipedCommands {
    const trimmed = input.trim();
    
    // Check if command contains pipe
    if (!trimmed.includes('|')) {
        return {
            isPiped: false,
            commands: [parseCommand(trimmed)]
        };
    }
    
    // Split by pipe and parse each command
    const commandStrings = trimmed.split('|').map(s => s.trim());
    const parsedCommands = commandStrings.map(cmd => parseCommand(cmd));
    
    return {
        isPiped: true,
        commands: parsedCommands
    };
}
