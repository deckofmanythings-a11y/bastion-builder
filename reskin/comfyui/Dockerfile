# ComfyUI for Bastion map reskins (runs on the always-on Foundry laptop, RTX 2060 6 GB).
FROM pytorch/pytorch:2.7.1-cuda12.6-cudnn9-runtime
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential && rm -rf /var/lib/apt/lists/*
ARG COMFY_REF=master
RUN git clone --depth 1 --branch ${COMFY_REF} https://github.com/comfyanonymous/ComfyUI /opt/ComfyUI \
 && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cu126 -r /opt/ComfyUI/requirements.txt
WORKDIR /opt/ComfyUI
EXPOSE 8188
# Only reachable inside the compose network / 127.0.0.1 on the laptop (see docker-compose.yml).
CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188", "--preview-method", "none", "--disable-auto-launch"]
