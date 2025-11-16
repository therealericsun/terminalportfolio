export interface Command {
    description: string;
    execute: () => string | null;
}

export const commands: Record<string, Command> = {
    help: {
        description: 'Display available commands',
        execute: () => {
            return `<div class="panel-box">Available commands:<br>` +
  `<span class="command">skills</span>     - View my technical skills<br>` +
  `<span class="command">projects</span>   - See my projects<br>` +
  `<span class="command">experience</span> - View my work experience<br>` +
  `<span class="command">clear</span>      - Clear the terminal<br>` +
  `<span class="command">contact</span>    - Get my contact information<br>` +
  `<span class="command">help</span>       - Display this help message</div>`;
        }
    },
    skills: {
        description: 'List technical skills',
        execute: () => {
            return `<div class="panel-box"><span class="section-heading">Languages:</span> ` +
                `Python, C++, C, Javascript / Typescript, SQL</div>` +
                `<div class="panel-box"><span class="section-heading">Libraries:</span> ` +
                `PyTorch, TensorFlow, Scikit-learn, Pandas, Polars, OpenCV, NumPy, SciPy, Sphinx, Matplotlib, ` +
                `Selenium, FastAPI, FastMCP, SQLalchemy, Prefect, MyPy, Ruff, Pydantic, Pybind11, ` +
                `Astro, Express, React</div>` +
                `<div class="panel-box"><span class="section-heading">Tools:</span> ` +
                `Git, Docker, PostgreSQL, Slurm, Jupyter, AWS (Bedrock, Lambda, EC2, S3, OpenSearch, ` +
                `Aurora, Neptune)</div>`;
        }
    },
    projects: {
        description: 'Show project portfolio',
        execute: () => {
            return `<div class="panel-box"><span class="section-heading">Terminal Style Porfolio Site</span><br>` +
                `A minimalistic and fully interactive terminal-style portfolio website built with Typescript, Astro, and vanilla CSS. You're looking at it right now.<br>` +
                `<a href="https://github.com/therealericsun/TerminalPortfolio" target="_blank">→ View on GitHub</a></div>` +
                `<div class="panel-box"><span class="section-heading">FLASH: An Extremely Fast Self-Consistent Field Solver</span><br>` +
                `High-performance solver for the radial Schrödinger and Dirac equations written in C++ with Python bindings. (Coming Soon!)</div>` +
                `<div class="panel-box"><span class="section-heading">DeepARPES: Convolutional Autoencoders for Photoemission Spectroscopy</span><br>` +
                `Machine learning pipeline for unsupervised analysis of experimental Angle-Resolved Photoemission Spetroscopy (ARPES) data, trained on tight-binding models. Built in Python with Tensorflow.<br>` +
                `<a href="https://github.com/therealericsun/deeparpes" target="_blank">→ View on GitHub</a></div>`;
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
};
