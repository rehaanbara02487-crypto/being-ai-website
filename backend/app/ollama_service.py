"""Ollama API integration for the workspace chat assistant."""

from collections.abc import Iterator
import json

import requests

from app.config import get_settings


class OllamaOfflineError(RuntimeError):
    """Raised when the local Ollama API cannot be reached."""


def get_ollama_model(requested_model: str | None = None) -> str:
    settings = get_settings()
    return requested_model or settings.ollama_model


def build_coding_prompt(
    prompt: str,
    system_prompt: str | None = None,
    repository_context: str | None = None,
) -> str:
    default_system_prompt = """
You are BEING AI, a senior AI software engineer.
Return complete, practical code when the user asks for code.
Keep answers concise and implementation-focused.
Do not use markdown fences unless the user asks for them.
""".strip()

    context_section = ""
    if repository_context:
        context_section = f"""

Workspace context:
{repository_context}

Use the workspace context to answer project-specific questions. Cite file paths when relevant.
""".rstrip()

    return f"{system_prompt or default_system_prompt}{context_section}\n\nUser request:\n{prompt}"


def stream_chat_response(
    prompt: str,
    model: str | None = None,
    system_prompt: str | None = None,
    repository_context: str | None = None,
) -> Iterator[dict]:
    settings = get_settings()
    selected_model = get_ollama_model(model)

    try:
        response = requests.post(
            f"{settings.ollama_base_url.rstrip('/')}/api/generate",
            json={
                "model": selected_model,
                "prompt": build_coding_prompt(prompt, system_prompt, repository_context),
                "stream": True,
            },
            stream=True,
            timeout=(3, 120),
        )
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:
        raise OllamaOfflineError(
            "Ollama is offline or unreachable. Start Ollama and make sure the model is pulled."
        ) from exc

    for line in response.iter_lines(decode_unicode=True):
        if not line:
            continue

        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            yield {
                "type": "error",
                "message": "Received invalid response from Ollama.",
            }
            return

        if payload.get("error"):
            yield {
                "type": "error",
                "message": payload["error"],
            }
            return

        token = payload.get("response", "")
        if token:
            yield {
                "type": "token",
                "content": token,
                "model": selected_model,
            }

        if payload.get("done"):
            yield {
                "type": "done",
                "model": selected_model,
            }
            return


def generate_text_response(
    prompt: str,
    model: str | None = None,
    system_prompt: str | None = None,
    repository_context: str | None = None,
) -> str:
    settings = get_settings()
    selected_model = get_ollama_model(model)

    try:
        response = requests.post(
            f"{settings.ollama_base_url.rstrip('/')}/api/generate",
            json={
                "model": selected_model,
                "prompt": build_coding_prompt(prompt, system_prompt, repository_context),
                "stream": False,
            },
            timeout=(3, 180),
        )
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:
        raise OllamaOfflineError(
            "Ollama is offline or unreachable. Start Ollama and make sure the model is pulled."
        ) from exc

    payload = response.json()
    if payload.get("error"):
        raise RuntimeError(payload["error"])

    return payload.get("response", "")


def get_ollama_status(model: str | None = None) -> dict:
    settings = get_settings()
    selected_model = get_ollama_model(model)
    base_url = settings.ollama_base_url.rstrip("/")
    status = {
        "online": False,
        "base_url": base_url,
        "model": selected_model,
        "model_available": False,
        "message": "",
        "models": [],
    }

    try:
        response = requests.get(f"{base_url}/api/tags", timeout=3)
        response.raise_for_status()
        status["online"] = True
        payload = response.json()
        models = [item.get("name") for item in payload.get("models", []) if item.get("name")]
        status["models"] = models
        status["model_available"] = selected_model in models or any(
            selected_model.split(":")[0] == name.split(":")[0] for name in models
        )
        if not models:
            status["message"] = "Ollama is running but no models are installed."
        elif not status["model_available"]:
            status["message"] = (
                f"Model '{selected_model}' is not pulled. Run: ollama pull {selected_model}"
            )
        else:
            status["message"] = "Ollama is connected."
        status["context_window_chars"] = settings.ollama_context_char_limit
        status["estimated_prompt_budget"] = settings.ollama_context_char_limit
    except requests.exceptions.ConnectionError:
        status["message"] = (
            f"Cannot reach Ollama at {base_url}. Start Ollama and verify OLLAMA_BASE_URL."
        )
    except requests.exceptions.Timeout:
        status["message"] = f"Timed out connecting to Ollama at {base_url}."
    except requests.exceptions.RequestException as exc:
        status["message"] = f"Ollama check failed: {exc}"

    return status
