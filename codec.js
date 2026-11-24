/* Browser-local GIF and MP4 processing. gif-libs.js must be loaded first. */
(() => {
  "use strict";
  const wasmURL = new URL("vendor/h264.js", document.currentScript.src).href;
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const maxPixels = 48_000_000;

  function bounds(w, h, count) {
    if (!w || !h || !count || w > 65535 || h > 65535 || w * h * count > maxPixels) {
      throw new Error("이미지가 너무 크거나 프레임이 없습니다. 작은 파일로 다시 시도하세요.");
    }
  }

  function decode(buffer) {
    const bytes = new Uint8Array(buffer);
    const reader = new GifReader(bytes);
    const width = reader.width, height = reader.height, count = reader.numFrames();
    bounds(width, height, count);
    const surface = new Uint8ClampedArray(width * height * 4);
    const pixels = new Uint32Array(surface.buffer);
    const first = reader.frameInfo(0);
    const backgroundOffset = 13 + bytes[11] * 3;
    const hasBackground = (bytes[10] & 128) && bytes[11] < (2 << (bytes[10] & 7));
    const bg = hasBackground ? new Uint32Array(new Uint8Array([
      bytes[backgroundOffset], bytes[backgroundOffset + 1], bytes[backgroundOffset + 2], 255
    ]).buffer)[0] : 0;
    if (first.transparent_index === null) pixels.fill(bg);
    const frames = [];
    for (let i = 0; i < count; i++) {
      const f = reader.frameInfo(i);
      if (f.x + f.width > width || f.y + f.height > height || !f.width || !f.height || f.palette_offset === null) {
        throw new Error("GIF 프레임의 크기 또는 색상표가 올바르지 않습니다.");
      }
      const previous = f.disposal === 3 ? surface.slice() : null;
      reader.decodeAndBlitFrameRGBA(i, surface);
      frames.push({image: new ImageData(surface.slice(), width, height), delay: f.delay * 10});
      if (previous) surface.set(previous);
      if (f.disposal === 2) {
        for (let y = f.y; y < f.y + f.height; y++) {
          const start = y * width + f.x;
          pixels.fill(f.transparent_index === null ? bg : 0, start, start + f.width);
        }
      }
    }
    return {width, height, frames, loop: reader.loopCount()};
  }

  function validate(frames) {
    const first = frames[0]?.image;
    if (!first) throw new Error("먼저 이미지를 추가하세요.");
    const {width, height} = first;
    bounds(width, height, frames.length);
    if (frames.some(f => f.image.width !== width || f.image.height !== height || !Number.isFinite(f.delay) || f.delay < 0)) {
      throw new Error("프레임 크기나 재생 시간이 올바르지 않습니다.");
    }
    return {width, height};
  }

  function indexed(data, maximum, reserveTransparent, exactOnly = false) {
    const colors = new Map();
    const indices = new Uint8Array(data.length / 4);
    const offset = reserveTransparent ? 1 : 0;
    let overflow = false;
    for (let n = 0, i = 0; i < data.length; i += 4, n++) {
      if (data[i + 3] < 128) continue;
      const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      if (!colors.has(rgb)) {
        if (colors.size === maximum - offset) { overflow = true; break; }
        colors.set(rgb, colors.size + offset);
      }
      indices[n] = colors.get(rgb);
    }
    let palette = [...colors.keys()];
    if (overflow) {
      if (exactOnly) return null;
      const reduced = gifenc.quantize(data, maximum - offset);
      const mapped = gifenc.applyPalette(data, reduced);
      for (let n = 0; n < mapped.length; n++) {
        indices[n] = data[n * 4 + 3] < 128 ? 0 : mapped[n] + offset;
      }
      palette = reduced.map(c => (c[0] << 16) | (c[1] << 8) | c[2]);
    }
    if (reserveTransparent) palette.unshift(0);
    let size = 2;
    while (size < palette.length) size *= 2;
    while (palette.length < size) palette.push(0);
    return {indices, palette};
  }

  // Keep exact colors whenever they already fit a GIF palette.
  function encode(frames, {loop = 0, colors = 256} = {}) {
    const {width, height} = validate(frames);
    colors = Math.min(256, Math.max(2, Math.round(colors)));
    const hasTransparency = frames.some(f => {
      const d = f.image.data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 128) return true;
      return false;
    });
    const bytes = [];
    const writer = new GifWriter(bytes, width, height, {loop});
    for (const f of frames) {
      const {indices, palette} = indexed(f.image.data, colors, hasTransparency);
      writer.addFrame(0, 0, width, height, indices, {
        palette, delay: Math.min(65535, Math.round(f.delay / 10)),
        disposal: hasTransparency ? 2 : 1, transparent: hasTransparency ? 0 : undefined
      });
    }
    writer.end();
    return new Blob([Uint8Array.from(bytes)], {type:"image/gif"});
  }

  // Preserve decoded pixels, frame count, timing and loop count. Encode only
  // changed rectangles when the disposal operation can leave the canvas intact.
  function optimize(buffer) {
    const original = new Uint8Array(buffer);
    const {width, height, frames, loop} = decode(original);
    if (frames.some(f => f.image.data.some((value, i) => i % 4 === 3 && value === 0))) {
      return optimizeTransparent(original, width, height, frames, loop);
    }
    const output = [];
    const writer = new GifWriter(output, width, height, {loop});
    let previous = new Uint32Array(width * height);
    for (const f of frames) {
      const image = new Uint32Array(f.image.data.buffer);
      let left = width, top = height, right = -1, bottom = -1;
      for (let i = 0; i < image.length; i++) {
        if (image[i] === previous[i]) continue;
        const x = i % width, y = Math.floor(i / width);
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      // Repaint the first frame's complete canvas when looping back from the last.
      if (f === frames[0]) {
        left = 0; top = 0; right = width - 1; bottom = height - 1;
      }
      if (right < left) { left = top = right = bottom = 0; }
      const w = right - left + 1, h = bottom - top + 1;
      const rectangle = new Uint32Array(w * h);
      let transparent = false;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (top + y) * width + left + x;
        if (image[i] === previous[i] || f.image.data[i * 4 + 3] === 0) transparent = true;
        else rectangle[y * w + x] = image[i];
      }
      const result = indexed(new Uint8ClampedArray(rectangle.buffer), 256, transparent, true);
      if (!result) return originalGif(original);
      writer.addFrame(left, top, w, h, result.indices, {palette:result.palette,
        delay:f.delay / 10, disposal:1, transparent:transparent ? 0 : undefined});
      previous = image;
    }
    writer.end();
    return originalGif(output.length < original.length ? Uint8Array.from(output) : original);
  }
  function originalGif(bytes) { return new Blob([bytes], {type:"image/gif"}); }

  function optimizeTransparent(original, width, height, frames, loop) {
    // Each independent rectangle is cleared on disposal, leaving a transparent
    // canvas for the next image. This also handles changes from opaque to clear.
    const output = [];
    const writer = new GifWriter(output, width, height, {loop});
    for (const {image, delay} of frames) {
      let left = width, top = height, right = -1, bottom = -1;
      for (let i = 3; i < image.data.length; i += 4) {
        if (!image.data[i]) continue;
        const p = (i - 3) / 4, x = p % width, y = Math.floor(p / width);
        left = Math.min(left,x); top = Math.min(top,y);
        right = Math.max(right,x); bottom = Math.max(bottom,y);
      }
      if (right < left) left = right = top = bottom = 0;
      const w = right - left + 1, h = bottom - top + 1;
      const rectangle = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        const start = ((y + top) * width + left) * 4;
        rectangle.set(image.data.subarray(start, start + w * 4), y * w * 4);
      }
      const result = indexed(rectangle, 256, true, true);
      if (!result) return originalGif(original);
      writer.addFrame(left, top, w, h, result.indices, {
        palette: result.palette, delay: delay / 10, disposal: 2, transparent: 0
      });
    }
    writer.end();
    return originalGif(output.length < original.length ? Uint8Array.from(output) : original);
  }

  function videoCanvas(frames, background) {
    const {width, height} = validate(frames);
    const src = document.createElement("canvas");
    src.width = width; src.height = height;
    const dst = document.createElement("canvas");
    dst.width = width + width % 2; dst.height = height + height % 2;
    const input = src.getContext("2d");
    const out = dst.getContext("2d", {alpha:false, willReadFrequently:true});
    return {canvas:dst, draw(image) {
      input.putImageData(image, 0, 0);
      out.fillStyle = background; out.fillRect(0, 0, dst.width, dst.height);
      out.drawImage(src, 0, 0);
    }, read() { return out.getImageData(0, 0, dst.width, dst.height).data; }};
  }
  const durationMs = f => Math.max(10, f.delay || 100);
  async function nativeMP4(frames, video) {
    const {width, height} = video.canvas;
    const config = {codec:"avc1.420034", width, height, bitrate: Math.max(500000, width * height * 6),
      framerate:30, latencyMode:"realtime", avc:{format:"avc"}};
    if (!window.VideoEncoder || !(await VideoEncoder.isConfigSupported(config)).supported) return null;
    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({target, video:{codec:"avc",width,height}, fastStart:"in-memory"});
    let failure = null;
    const durations = new Map();
    const encoder = new VideoEncoder({output:(chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      muxer.addVideoChunkRaw(data, chunk.type, chunk.timestamp, durations.get(chunk.timestamp), meta);
      durations.delete(chunk.timestamp);
    },
      error:e => {failure = e;}});
    try {
      encoder.configure(config);
      let time = 0;
      for (let i = 0; i < frames.length; i++) {
        const duration = Math.round(durationMs(frames[i]) * 1000);
        video.draw(frames[i].image);
        // The muxer uses the preceding timestamp delta for the last sample.
        // Split the final hold into equal halves to preserve variable GIF timing.
        const parts = i === frames.length - 1 ? [duration / 2, duration / 2] : [duration];
        for (const part of parts) {
          const frame = new VideoFrame(video.canvas, {timestamp:time,duration:part});
          durations.set(time, part);
          try { encoder.encode(frame, {keyFrame:time === 0}); } finally { frame.close(); }
          time += part;
        }
        if (encoder.encodeQueueSize > 6) await encoder.flush();
        if (failure) throw failure;
      }
      await encoder.flush();
      if (failure) throw failure;
      muxer.finalize();
      return new Blob([target.buffer], {type:"video/mp4"});
    } finally { if (encoder.state !== "closed") encoder.close(); }
  }

  let wasmLibrary;
  function loadWasmLibrary() {
    if (!wasmLibrary) wasmLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = wasmURL; script.onload = () => resolve(window.HME);
      script.onerror = () => { wasmLibrary = null; reject(new Error("MP4 변환 모듈을 불러올 수 없습니다.")); };
      document.head.appendChild(script);
    });
    return wasmLibrary;
  }
  async function mp4(frames, {background="#ffffff"} = {}) {
    const video = videoCanvas(frames, background);
    try {
      const result = await nativeMP4(frames, video);
      if (result) return result;
    } catch { /* Hardware support can differ from the advertised capability. */ }
    const HME = await loadWasmLibrary();
    const encoder = await HME.createH264MP4Encoder();
    try {
      encoder.width = video.canvas.width; encoder.height = video.canvas.height;
      function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
      const step = frames.reduce((d, f) => gcd(d, Math.max(10, Math.round(durationMs(f) / 10) * 10)), 1000);
      encoder.frameRate = 1000 / step; encoder.speed = 7; encoder.quantizationParameter = 22;
      encoder.initialize();
      let elapsed = 0, emitted = 0;
      for (const f of frames) {
        elapsed += durationMs(f);
        const end = Math.max(1, Math.round(elapsed * encoder.frameRate / 1000));
        video.draw(f.image);
        const rgba = video.read();
        for (; emitted < end; emitted++) {
          encoder.addFrameRgba(rgba);
          if (emitted % 12 === 0) await tick();
        }
      }
      encoder.finalize();
      return new Blob([encoder.FS.readFile(encoder.outputFilename)], {type:"video/mp4"});
    } finally { encoder.delete(); }
  }
  window.GifCodec = {decode, encode, optimize, mp4};
})();
