# Bastion map reskins (runs on the Foundry laptop)

The Maps tab's **Paint it** button sends a clean line drawing of one floor (white walls on black) to the
`bb-reskin` edge function, which queues a job in `bb_reskin_jobs` (raided-hex Supabase). This folder is the
laptop side: ComfyUI paints over the drawing with a line ControlNet, so walls stay where the map puts them,
and the browser adds the room numbers and key back on top.

Nothing listens on the internet: ComfyUI binds to 127.0.0.1, and the worker only makes outbound HTTPS calls.

## Layout on the laptop (`~/bastion-reskin`)
- `docker-compose.yml` — `comfyui` (GPU via CDI `nvidia.com/gpu=all`) + `worker`
- `comfyui/Dockerfile` — PyTorch 2.7.1 / CUDA 12.6 + ComfyUI
- `worker/worker.mjs` — polls the queue (cheap anon REST read), claims through the edge function, runs ComfyUI
- `fetch-models.sh` — downloads the models from Hugging Face
- `.env` (mode 600, **not in git**) — `BB_WORKER_TOKEN`, `RESKIN_FUNCTION_URL`, `SB_KEY`, optional `RESKIN_MODEL=sd15|sdxl`

The worker token is also the Supabase secret `BB_WORKER_TOKEN`. To rotate it, set a new value in both places.

## Deploy / update
```bash
scp -r reskin/* foundry-laptop:~/bastion-reskin/
ssh foundry-laptop 'cd ~/bastion-reskin && docker compose up -d --build'
ssh foundry-laptop 'docker logs -f bastion-reskin-worker'
```
GPU access needed the NVIDIA container toolkit plus `sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml`
(Docker 29 reads CDI specs natively, so no Docker restart, and Foundry stays up). Regenerate the CDI spec after
NVIDIA driver updates.

## Models
- SD 1.5: `DreamShaper_8_pruned` + `control_v11p_sd15_lineart_fp16` (`RESKIN_MODEL=sd15`: faster but plainer)
- SDXL (default): `dreamshaperXL_lightningDPMSDE` (copied from the desktop) + xinsir ControlNet Union promax.

## Two modes
- **Furnished (current)**: the browser sends the furnished battle map from furnish.js (JPEG). The worker repaints it at
  denoise 0.55 with a canny ControlNet built from the same picture, so furniture, walls and the entrance stay put
  (`PAINT_DENOISE`, `PAINT_CN` in .env to tune). About 2 minutes per floor: with the 9 GB cap the models can't all
  stay in RAM. Without the ControlNet it was about 50 s, but walls drifted (the foyer became a room), so it stays on.
- **Line art (older jobs)**: white walls on black, painted from scratch. Dropped as the default because the AI had no
  idea what each room was: beds vanished and doors became decorations.
