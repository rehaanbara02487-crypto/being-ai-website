"""Stack templates for greenfield project generation."""

from __future__ import annotations

STACK_TEMPLATES: dict[str, dict] = {
    "react-vite": {
        "label": "React + Vite",
        "run_profile": {
            "type": "npm",
            "install_command": "npm install",
            "start_command": "npm run dev",
            "script": "dev",
        },
        "required_folders": ["src", "public"],
        "required_files": [
            "package.json",
            "index.html",
            "vite.config.js",
            "src/main.jsx",
            "src/App.jsx",
            "src/index.css",
        ],
        "guidance": """
Use React 18+ with Vite. Use functional components and hooks.
Include a complete package.json with scripts: dev, build, preview.
Use JSX in src/. Include vite.config.js.
Make the app runnable with `npm install` then `npm run dev`.
""".strip(),
    },
    "flask": {
        "label": "Flask",
        "run_profile": {
            "type": "python",
            "entrypoint": "app.py",
        },
        "required_folders": ["templates", "static"],
        "required_files": ["app.py", "requirements.txt"],
        "guidance": """
Use Flask. Entry point app.py with `if __name__ == "__main__"` block.
Include requirements.txt with Flask pinned loosely.
""".strip(),
    },
    "fastapi": {
        "label": "FastAPI",
        "run_profile": {
            "type": "python",
            "entrypoint": "main.py",
        },
        "required_folders": [],
        "required_files": ["main.py", "requirements.txt"],
        "guidance": """
Use FastAPI with uvicorn. Entry point main.py.
Include requirements.txt with fastapi and uvicorn.
""".strip(),
    },
    "nextjs": {
        "label": "Next.js",
        "run_profile": {
            "type": "npm",
            "install_command": "npm install",
            "start_command": "npm run dev",
            "script": "dev",
        },
        "required_folders": ["app", "public"],
        "required_files": ["package.json", "next.config.js", "app/page.jsx", "app/layout.jsx"],
        "guidance": "Use Next.js App Router with JavaScript/JSX unless TypeScript is requested.",
    },
    "vue-vite": {
        "label": "Vue + Vite",
        "run_profile": {
            "type": "npm",
            "install_command": "npm install",
            "start_command": "npm run dev",
            "script": "dev",
        },
        "required_folders": ["src"],
        "required_files": ["package.json", "vite.config.js", "src/main.js", "src/App.vue"],
        "guidance": "Use Vue 3 with Vite and a single-file App.vue entry.",
    },
    "express": {
        "label": "Express",
        "run_profile": {
            "type": "npm",
            "install_command": "npm install",
            "start_command": "npm start",
            "script": "start",
        },
        "required_folders": ["src"],
        "required_files": ["package.json", "src/index.js"],
        "guidance": "Use Express with a src/index.js entry and npm start script.",
    },
    "node-cli": {
        "label": "Node CLI",
        "run_profile": {
            "type": "npm",
            "install_command": "npm install",
            "start_command": "node src/index.js",
        },
        "required_folders": ["src"],
        "required_files": ["package.json", "src/index.js", "README.md"],
        "guidance": "Create a small Node CLI with package.json bin entry when appropriate.",
    },
}


def detect_stack(prompt: str, requested_stack: str | None = None) -> str:
    if requested_stack and requested_stack in STACK_TEMPLATES:
        return requested_stack

    lowered = prompt.lower()
    if "next" in lowered or "nextjs" in lowered:
        return "nextjs"
    if "vue" in lowered:
        return "vue-vite"
    if "express" in lowered or "node api" in lowered:
        return "express"
    if "cli" in lowered and "node" in lowered:
        return "node-cli"
    if "react" in lowered or "vite" in lowered or "todo" in lowered:
        return "react-vite"
    if "flask" in lowered:
        return "flask"
    if "fastapi" in lowered:
        return "fastapi"
    return "react-vite"


def get_template(stack: str) -> dict:
    return STACK_TEMPLATES.get(stack, STACK_TEMPLATES["react-vite"])
