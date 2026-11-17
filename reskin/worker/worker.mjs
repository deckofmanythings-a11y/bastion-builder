// Bastion reskin worker — runs on the Foundry laptop next to ComfyUI. No dependencies (Node 22).
// Loop: cheap REST check for queued jobs (anon read) → claim via the bb-reskin edge function (worker token) →
// run the ControlNet workflow in ComfyUI → upload the result through the edge function.
const env = (k, d = '') => process.env[k] ?? d;
const TOKEN = env('BB_WORKER_TOKEN');
const FN = env('RESKIN_FUNCTION_URL');
const SB_KEY = env('SB_KEY');
const SB_URL = FN.replace(/\/functions\/v1\/.*$/, '');
const COMFY = env('COMFY_URL', 'http://comfyui:8188');
const MODEL = env('RESKIN_MODEL', 'sdxl'); // sdxl (default, richer) | sd15 (faster, plainer)
const POLL_MS = +env('POLL_MS', '5000');

const MODELS = {
  sd15: { ckpt: 'DreamShaper_8_pruned.safetensors', cn: 'control_v11p_sd15_lineart_fp16.safetensors', long: 768,
          steps: 28, cfg: 6.5, sampler: 'dpmpp_2m', scheduler: 'karras', strength: 1.0, end: 0.9 },
  sdxl: { ckpt: 'dreamshaperXL_lightningDPMSDE.safetensors', cn: 'xinsir_union_sdxl_promax.safetensors', union: 'canny/lineart/anime_lineart/mlsd',
          long: 1024, steps: 7, cfg: 2.0, sampler: 'dpmpp_sde', scheduler: 'karras', strength: 0.9, end: 0.85 },
};
const M = MODELS[MODEL] || MODELS.sd15;
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fn(body) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-worker-token': TOKEN, apikey: SB_KEY }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${body.action} ${r.status} ${out.error || ''}`);
  return out;
}
async function anythingQueued() {
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const q = `or=(status.eq.queued,and(status.eq.running,started_at.lt.${stale}))&select=id&limit=1`;
  const r = await fetch(`${SB_URL}/rest/v1/bb_reskin_jobs?${q}`, { headers: { apikey: SB_KEY } });
  if (!r.ok) throw new Error(`queue check ${r.status}`);
  return (await r.json()).length > 0;
}

function fit(w, h, long) { // keep aspect, long side = `long`, multiples of 8
  const s = long / Math.max(w, h);
  return [Math.max(256, Math.round(w * s / 8) * 8), Math.max(256, Math.round(h * s / 8) * 8)];
}
// Furnished base (meta.furnished): img2img over our own render. The furniture, doors and entrance are already
// drawn, so the AI only restyles: partial denoise keeps every object where it is, and a canny ControlNet built
// from the same picture holds the edges.
const PAINT = { denoise: +env('PAINT_DENOISE', '0.55'), strength: +env('PAINT_CN', '0.6'), end: 0.9 };
function paintWorkflow(job, image, seed) {
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: MODELS.sdxl.ckpt } },
    2: { class_type: 'CLIPTextEncode', inputs: { text: job.prompt, clip: ['1', 1] } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: job.negative, clip: ['1', 1] } },
    4: { class_type: 'LoadImage', inputs: { image } },
    5: { class_type: 'ControlNetLoader', inputs: { control_net_name: MODELS.sdxl.cn } },
    11: { class_type: 'SetUnionControlNetType', inputs: { control_net: ['5', 0], type: MODELS.sdxl.union } },
    12: { class_type: 'VAEEncode', inputs: { pixels: ['4', 0], vae: ['1', 2] } },
    13: { class_type: 'Canny', inputs: { image: ['4', 0], low_threshold: 0.15, high_threshold: 0.45 } },
    6: { class_type: 'ControlNetApplyAdvanced', inputs: { positive: ['2', 0], negative: ['3', 0], control_net: ['11', 0], image: ['13', 0],
      strength: PAINT.strength, start_percent: 0, end_percent: PAINT.end, vae: ['1', 2] } },
    8: { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['6', 0], negative: ['6', 1], latent_image: ['12', 0], seed,
      steps: 8, cfg: 2.0, sampler_name: 'dpmpp_sde', scheduler: 'karras', denoise: PAINT.denoise } },
    9: { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['1', 2] } },
    10: { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'reskin' } },
  };
}
function workflow(job, image, seed) {
  if (job.meta?.furnished) return paintWorkflow(job, image, seed);
  const [W, H] = fit(job.width, job.height, M.long);
  const g = {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: M.ckpt } },
    2: { class_type: 'CLIPTextEncode', inputs: { text: job.prompt, clip: ['1', 1] } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: job.negative, clip: ['1', 1] } },
    4: { class_type: 'LoadImage', inputs: { image } },
    5: { class_type: 'ControlNetLoader', inputs: { control_net_name: M.cn } },
    7: { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
    8: { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['6', 0], negative: ['6', 1], latent_image: ['7', 0], seed,
      steps: M.steps, cfg: M.cfg, sampler_name: M.sampler, scheduler: M.scheduler, denoise: 1 } },
    9: { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['1', 2] } },
    10: { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'reskin' } },
  };
  let cn = ['5', 0];
  if (M.union) { g[11] = { class_type: 'SetUnionControlNetType', inputs: { control_net: ['5', 0], type: M.union } }; cn = ['11', 0]; }
  g[6] = { class_type: 'ControlNetApplyAdvanced', inputs: { positive: ['2', 0], negative: ['3', 0], control_net: cn, image: ['4', 0],
    strength: M.strength, start_percent: 0, end_percent: M.end, vae: ['1', 2] } };
  return g;
}

async function runJob(job) {
  const ctrl = await fetch(job.control_url);
  if (!ctrl.ok) throw new Error(`control image ${ctrl.status}`);
  const form = new FormData();
  const jpg = /\.jpe?g$/i.test(job.control_url);
  form.append('image', new Blob([await ctrl.arrayBuffer()], { type: jpg ? 'image/jpeg' : 'image/png' }), `ctrl-${job.id}.${jpg ? 'jpg' : 'png'}`);
  form.append('overwrite', 'true');
  const up = await (await fetch(`${COMFY}/upload/image`, { method: 'POST', body: form })).json();
  const seed = Math.floor(Math.random() * 2 ** 32);
  const pr = await fetch(`${COMFY}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow(job, up.name, seed), client_id: 'bastion-reskin' }) });
  const prj = await pr.json();
  if (!pr.ok || !prj.prompt_id) throw new Error(`comfy rejected: ${JSON.stringify(prj).slice(0, 300)}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 8 * 60 * 1000) {
    await sleep(1500);
    const h = (await (await fetch(`${COMFY}/history/${prj.prompt_id}`)).json())[prj.prompt_id];
    if (!h) continue;
    if (h.status?.status_str === 'error') throw new Error('comfy error: ' + JSON.stringify(h.status.messages || '').slice(0, 300));
    const img = Object.values(h.outputs || {}).flatMap((o) => o.images || [])[0];
    if (!img) continue;
    const v = await fetch(`${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=output`);
    const buf = Buffer.from(await v.arrayBuffer());
    return { buf, secs: (Date.now() - t0) / 1000 };
  }
  throw new Error('timed out in ComfyUI');
}

async function main() {
  if (!TOKEN || !FN) { console.error('BB_WORKER_TOKEN and RESKIN_FUNCTION_URL are required'); process.exit(1); }
  log(`worker up · model ${MODEL} · comfy ${COMFY}`);
  let lastJob = 0, loaded = false;
  const IDLE_FREE_MS = +env('IDLE_FREE_MS', String(10 * 60 * 1000));
  for (;;) {
    try {
      if (!(await anythingQueued())) {
        // give the laptop's RAM back to Foundry when nobody has painted for a while
        if (loaded && Date.now() - lastJob > IDLE_FREE_MS) {
          await fetch(`${COMFY}/free`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }).catch(() => {});
          loaded = false; log('idle: models unloaded');
        }
        await sleep(POLL_MS); continue;
      }
      lastJob = Date.now(); loaded = true;
      const { job } = await fn({ action: 'claim' });
      if (!job) { await sleep(POLL_MS); continue; }
      log(`job ${job.id} ${job.style} ${job.width}x${job.height}`);
      try {
        const { buf, secs } = await runJob(job);
        await fn({ action: 'complete', id: job.id, image: buf.toString('base64'), mime: 'image/png' });
        log(`job ${job.id} done in ${secs.toFixed(1)}s (${(buf.length / 1024).toFixed(0)} KB)`);
      } catch (e) {
        log(`job ${job.id} failed: ${e.message}`);
        await fn({ action: 'fail', id: job.id, error: e.message }).catch(() => {});
      }
    } catch (e) {
      log('loop error:', e.message);
      await sleep(15000);
    }
  }
}
main();
