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


def build_coding_prompt(prompt: str, system_prompt: str | None = None) -> str:
    default_system_prompt = """
You are BEING AI, a senior AI software engineer.
Return complete, practical code when the user asks for code.
Keep answers concise and implementation-focused.
Do not use markdown fences unless the user asks for them.
""".strip()

    return f"{system_prompt or default_system_prompt}\n\nUser request:\n{prompt}"


def stream_chat_response(
    prompt: str,
    model: str | None = None,
    system_prompt: str | None = None,
) -> Iterator[dict]:
    settings = get_settings()
    selected_model = get_ollama_model(model)

    try:
        response = requests.post(
            f"{settings.ollama_base_url.rstrip('/')}/api/generate",
            json={
                "model": selected_model,
                "prompt": build_coding_prompt(prompt, system_prompt),
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
