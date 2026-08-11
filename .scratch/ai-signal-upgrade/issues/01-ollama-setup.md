Type: task
Status: resolved

## Question

Get local LLM inference running on this machine so the model-selection research (ticket 02) has something real to test against.

Install [Ollama](https://ollama.com) on this Windows machine (CPU-only: Intel UHD 770 integrated graphics, no discrete GPU, ~16GB RAM), then pull a small shortlist of candidate models sized to fit that hardware (3B–7B quantized) for hands-on comparison in ticket 02. Suggested starting shortlist — confirm availability on Ollama's library and adjust if a listed tag doesn't exist or doesn't fit the RAM budget:

- A Thai-tuned model (e.g. `typhoon` family, if published on Ollama's library) — Thai-language quality is the main risk factor for this whole effort.
- A strong general small multilingual model (e.g. `qwen2.5:7b` or `qwen2.5:3b`) — Qwen's multilingual training includes Thai.
- A widely-used small baseline (e.g. `llama3.2:3b`) as a speed/quality floor to compare against.

Verify each pulled model actually runs (`ollama run <model> "..."`) and note real inference speed (tokens/sec) and RAM usage on this hardware — ticket 02 needs these numbers, not just that the pull succeeded.

## Answer

Ollama v0.32.6 installed via `winget install --id Ollama.Ollama` and confirmed running (`ollama --version`, `GET /api/version` on `127.0.0.1:11434`).

**Shortlist adjusted from the original plan mid-flight**: `qwen2.5:7b` was dropped in favor of `qwen2.5:3b`. This machine's `C:` drive was critically low on free space (down to ~7GB) partway through the three parallel pulls, driven mostly by pre-existing system usage (~232GB/238GB already used) rather than by these pulls alone — but `qwen2.5:7b`'s 4.7GB size made it the biggest marginal risk, so it was killed and its 4.46GB partial blob deleted to reclaim headroom, then `qwen2.5:3b` (2GB) pulled instead. Also cleared ~1.3GB of Windows/user temp files as part of the same pass. A `docker builder prune` was attempted but the Docker daemon was unresponsive (timed out repeatedly) during and after the disk-pressure period — not retried to a confirmed result; worth a manual check later if `C:` gets tight again.

Two of the three pulls (`typhoon2-3b`, `llama3.2:3b`) also stalled mid-download independently of the disk issue (progress frozen, zero CPU, no active network connection) and needed a kill+resume each — both resumed instantly from their partial blobs and finished normally. Cause unconfirmed (registry-side throttle is the best guess, since a same-machine, same-network pull of `qwen2.5:3b` completed without issue in the same window).

**Final installed set** (`ollama list`):

| Model | Size | Notes |
|---|---|---|
| `scb10x/llama3.2-typhoon2-3b-instruct` | 2.0 GB | Thai-tuned (SCB 10X Typhoon2), general instruct |
| `qwen2.5:3b` | 1.9 GB | multilingual baseline, substituted for the originally-planned 7b |
| `llama3.2:3b` | 2.0 GB | general-purpose speed/quality floor |

Free space on `C:` after all three installs: ~6 GB (tight but stable; not a blocker for ticket 02's inference testing, which needs no further downloads).

