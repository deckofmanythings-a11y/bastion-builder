#!/usr/bin/env bash
# Downloads the models the reskin workflows use (Hugging Face, public repos). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p models/checkpoints models/controlnet io/input io/output
get() { # url dest
  if [ -s "$2" ]; then echo "have $2"; return; fi
  echo "fetch $2"; curl -fL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"
}
HF=https://huggingface.co
get "$HF/Lykon/DreamShaper/resolve/main/DreamShaper_8_pruned.safetensors" models/checkpoints/DreamShaper_8_pruned.safetensors
get "$HF/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_v11p_sd15_lineart_fp16.safetensors" models/controlnet/control_v11p_sd15_lineart_fp16.safetensors
get "$HF/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_v11p_sd15_mlsd_fp16.safetensors" models/controlnet/control_v11p_sd15_mlsd_fp16.safetensors
get "$HF/xinsir/controlnet-union-sdxl-1.0/resolve/main/diffusion_pytorch_model_promax.safetensors" models/controlnet/xinsir_union_sdxl_promax.safetensors
ls -la models/checkpoints models/controlnet
