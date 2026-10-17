(() => {
  const lang = document.documentElement.lang === 'en' ? 'en' : 'es';
  const labels = lang === 'en'
    ? { title: 'Xolos Ramírez Anthem', play: 'Play anthem', pause: 'Pause anthem', mute: 'Mute', unmute: 'Unmute', unavailable: 'Anthem unavailable' }
    : { title: 'Himno de Xolos Ramírez', play: 'Escuchar himno', pause: 'Pausar himno', mute: 'Silenciar', unmute: 'Activar sonido', unavailable: 'Himno no disponible' };
  const source = '/audio/the-radiant-xoloitzcuintles.mp3';
  const player = document.createElement('div');
  player.className = 'xr-hymn';
  player.setAttribute('role', 'group');
  player.setAttribute('aria-label', labels.title);
  player.innerHTML = '<span class="xr-hymn__title">🎶 ' + labels.title + '</span><button type="button" class="xr-hymn__play"></button><button type="button" class="xr-hymn__mute"></button>';
  const play = player.querySelector('.xr-hymn__play');
  const mute = player.querySelector('.xr-hymn__mute');
  const audio = new Audio(source);
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = 0.45;
  const choice = (() => { try { return localStorage.getItem('xr-hymn-choice'); } catch { return null; } })();
  audio.muted = choice === 'muted';
  const remember = value => { try { localStorage.setItem('xr-hymn-choice', value); } catch {} };
  const refresh = () => {
    play.textContent = audio.paused ? '▶ ' + labels.play : '⏸ ' + labels.pause;
    mute.textContent = audio.muted ? '🔇 ' + labels.unmute : '🔊 ' + labels.mute;
    play.setAttribute('aria-pressed', String(!audio.paused));
    mute.setAttribute('aria-pressed', String(audio.muted));
  };
  play.addEventListener('click', async () => {
    if (!audio.paused) { audio.pause(); remember('paused'); return; }
    try { await audio.play(); remember(audio.muted ? 'muted' : 'playing'); } catch { /* Browser autoplay or network restrictions */ }
    refresh();
  });
  mute.addEventListener('click', () => {
    audio.muted = !audio.muted;
    remember(audio.muted ? 'muted' : (audio.paused ? 'paused' : 'playing'));
    refresh();
  });
  audio.addEventListener('play', refresh);
  audio.addEventListener('pause', refresh);
  refresh();
  // Never show a broken player before the MP3 has been deployed.
  fetch(source, { method: 'HEAD' }).then(response => {
    if (!response.ok || !(response.headers.get('content-type') || '').includes('audio')) return;
    document.body.appendChild(player);
    if (choice === 'paused') return;
    // Browsers will reject unprompted sound playback as appropriate.
    audio.play().catch(() => refresh());
  }).catch(() => {});
})();
