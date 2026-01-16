// virtual-clock.js
// 内置虚拟时钟：全局接管 Date / Date.now，带可拖动悬浮按钮 + 控制面板
// ✅ 新增：用 localStorage 记住 baseRealMs / baseVirtualMs / speed，刷新后继续用上一次的虚拟时间和流速

(function () {
    // 1. 保留真实 Date
    const RealDate = window.Date;

    // 用于持久化的 key
    const STORAGE_KEY = 'virtual-clock-state-v1';

    // 从 localStorage 读取上一次保存的状态
    function loadState() {
        try {
            const raw = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (
                typeof obj.baseRealMs === 'number' &&
                typeof obj.baseVirtualMs === 'number' &&
                typeof obj.speed === 'number' &&
                isFinite(obj.speed) &&
                obj.speed > 0
            ) {
                return obj;
            }
        } catch (e) {
            console.warn('[virtual-clock] loadState failed:', e);
        }
        return null;
    }

    // 将当前状态写入 localStorage
    function saveState() {
        try {
            if (!window.localStorage) return;
            const payload = {
                baseRealMs: state.baseRealMs,
                baseVirtualMs: state.baseVirtualMs,
                speed: state.speed
            };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('[virtual-clock] saveState failed:', e);
        }
    }

    const saved = loadState();

    // 2. 虚拟时钟核心状态
    const state = {
        baseRealMs: saved ? saved.baseRealMs : RealDate.now(),    // 最近一次“校准”时的真实时间
        baseVirtualMs: saved ? saved.baseVirtualMs : RealDate.now(), // 最近一次“校准”时的虚拟时间
        speed: saved ? saved.speed : 1                       // 时间倍率
    };

    function getVirtualNowMs() {
        const realNow = RealDate.now();
        const delta = realNow - state.baseRealMs;
        return state.baseVirtualMs + delta * state.speed;
    }

    function setVirtualTime(dateOrMs) {
        const d = (dateOrMs instanceof RealDate)
            ? dateOrMs
            : new RealDate(dateOrMs);
        state.baseVirtualMs = d.getTime();
        state.baseRealMs = RealDate.now();
        saveState(); // ★ 修改时间后保存
    }

    function setSpeed(newSpeed) {
        const s = Number(newSpeed);
        if (!isFinite(s) || s <= 0) return;
        const nowVirtual = getVirtualNowMs();
        state.baseVirtualMs = nowVirtual;
        state.baseRealMs = RealDate.now();
        state.speed = s;
        saveState(); // ★ 修改流速后保存
    }

    function resetClock() {
        const now = RealDate.now();
        state.baseRealMs = now;
        state.baseVirtualMs = now;
        state.speed = 1;
        saveState(); // ★ 重置后保存
    }

    // 3. 替换全局 Date
    function VirtualDate(...args) {
        if (new.target === VirtualDate) {
            let d;
            if (args.length === 0) {
                d = new RealDate(getVirtualNowMs());
            } else {
                d = new RealDate(...args);
            }
            Object.setPrototypeOf(d, VirtualDate.prototype);
            return d;
        }
        return new RealDate(getVirtualNowMs()).toString();
    }

    Object.setPrototypeOf(VirtualDate, RealDate);
    VirtualDate.prototype = RealDate.prototype;

    VirtualDate.now = function () {
        return getVirtualNowMs();
    };
    VirtualDate.UTC = RealDate.UTC;
    VirtualDate.parse = RealDate.parse;

    window.Date = VirtualDate;

    // 4. 暴露控制接口
    window.virtualClock = {
        nowMs: () => getVirtualNowMs(),
        nowDate: () => new RealDate(getVirtualNowMs()),
        setTime: setVirtualTime,
        setSpeed,
        reset: resetClock,
        getState: () => ({
            virtualMs: getVirtualNowMs(),
            speed: state.speed
        })
    };

    // 5. UI
    function createClockUI() {
        // ===== 悬浮按钮（可拖动） =====
        const btn = document.createElement('div');
        btn.id = 'virtual-clock-toggle';
        btn.textContent = '⏱';
        Object.assign(btn.style, {
            position: 'fixed',
            right: '12px',
            bottom: '80px',
            width: '40px',
            height: '40px',
            borderRadius: '999px',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            zIndex: 10001,
            fontSize: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            userSelect: 'none',
            backdropFilter: 'blur(8px)'
        });

        // ===== 面板 =====
        const panel = document.createElement('div');
        panel.id = 'virtual-clock-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            width: '280px',
            padding: '12px 14px',
            borderRadius: '14px',
            background: 'rgba(15,15,15,0.96)',
            color: '#fff',
            fontSize: '12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            zIndex: 10000,
            display: 'none',
            boxSizing: 'border-box'
        });

        panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <div style="font-weight:600;font-size:13px;">虚拟时钟</div>
          <div style="opacity:.6;font-size:11px;">内置时间，不跟随系统时间</div>
        </div>
        <button type="button" id="vc-reset-btn"
          style="border:none;background:#444;color:#fff;border-radius:999px;padding:4px 10px;font-size:11px;cursor:pointer;">
          重置为当前真实时间
        </button>
      </div>

      <div style="border-radius:10px;background:rgba(255,255,255,0.03);padding:8px 10px;margin-bottom:8px;">
        <div style="opacity:.7;margin-bottom:4px;">当前虚拟时间</div>
        <div id="vc-display-time"
             style="font-family:system-ui,monospace;font-size:18px;font-weight:600;">
          --
        </div>
        <div id="vc-display-date"
             style="font-family:system-ui,monospace;font-size:12px;opacity:.9;margin-top:2px;">
          --
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="opacity:.8;">时间调整</span>
          <span style="opacity:.6;font-size:11px;">单独控制虚拟时间</span>
        </div>
        <input id="vc-datetime-input" type="datetime-local"
               style="width:100%;box-sizing:border-box;background:#222;border:1px solid #555;color:#fff;border-radius:8px;padding:5px 8px;font-size:12px;">
        <button type="button" id="vc-apply-time-btn"
          style="margin-top:6px;width:100%;border:none;background:#2d7efb;color:#fff;border-radius:8px;padding:6px 0;font-size:12px;cursor:pointer;">
          应用时间
        </button>
      </div>

      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="opacity:.8;">流速调整</span>
          <span id="vc-speed-label" style="opacity:.9;font-size:11px;">当前流速：1x</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <input id="vc-speed-range" type="range" min="0.1" max="5" step="0.1" value="1"
               style="flex:1;">
          <input id="vc-speed-number" type="number" min="0.1" max="5" step="0.1" value="1"
               style="width:60px;box-sizing:border-box;background:#222;border:1px solid #555;color:#fff;border-radius:6px;padding:4px 6px;font-size:12px;text-align:center;">
        </div>
        <div style="display:flex;gap:8px;">
          <button type="button" id="vc-apply-speed-btn"
            style="flex:1;border:none;background:#3b82f6;color:#fff;border-radius:8px;padding:6px 0;font-size:12px;cursor:pointer;">
            应用流速
          </button>
          <button type="button" id="vc-reset-speed-btn"
            style="flex:1;border:none;background:#444;color:#fff;border-radius:8px;padding:6px 0;font-size:12px;cursor:pointer;">
            流速重置 1x
          </button>
        </div>
      </div>
    `;

        document.body.appendChild(panel);
        document.body.appendChild(btn);

        const displayTimeEl = panel.querySelector('#vc-display-time');
        const displayDateEl = panel.querySelector('#vc-display-date');
        const datetimeInput = panel.querySelector('#vc-datetime-input');
        const applyTimeBtn = panel.querySelector('#vc-apply-time-btn');
        const speedRange = panel.querySelector('#vc-speed-range');
        const speedNumber = panel.querySelector('#vc-speed-number');
        const speedLabel = panel.querySelector('#vc-speed-label');
        const applySpeedBtn = panel.querySelector('#vc-apply-speed-btn');
        const resetSpeedBtn = panel.querySelector('#vc-reset-speed-btn');
        const resetBtn = panel.querySelector('#vc-reset-btn');

        const WEEK_MAP = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

        function pad(n) {
            return n < 10 ? '0' + n : '' + n;
        }

        // 初始化流速滑条和数字框为当前 state.speed（支持刷新后记忆）
        speedRange.value = state.speed;
        speedNumber.value = state.speed.toFixed(1).replace(/\.0$/, '');

        // 面板显示位置：贴着按钮上方 / 下方
        function positionPanel() {
            const rect = btn.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            let left = rect.left + rect.width / 2 - panelRect.width / 2;
            let top = rect.top - panelRect.height - 8;

            if (left < 8) left = 8;
            if (left + panelRect.width > window.innerWidth - 8) {
                left = window.innerWidth - panelRect.width - 8;
            }
            if (top < 8) top = rect.bottom + 8;

            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        }

        function updateDisplay() {
            const d = new RealDate(getVirtualNowMs());
            const y = d.getFullYear();
            const m = pad(d.getMonth() + 1);
            const day = pad(d.getDate());
            const hh = pad(d.getHours());
            const mm = pad(d.getMinutes());
            const ss = pad(d.getSeconds());
            const week = WEEK_MAP[d.getDay()];

            displayTimeEl.textContent = `${hh}:${mm}:${ss}`;
            displayDateEl.textContent = `${y}-${m}-${day}  ${week}`;

            if (!datetimeInput.dataset.initialized) {
                const local = new RealDate(d.getTime() - d.getTimezoneOffset() * 60000);
                datetimeInput.value = local.toISOString().slice(0, 16);
                datetimeInput.dataset.initialized = '1';
            }

            speedLabel.textContent =
                `当前流速：${state.speed.toFixed(1).replace(/\.0$/, '')}x`;
            // 这里就不再强行覆盖 slider/number，避免和其他地方的同步逻辑打架
            // 由初始化 + setSpeed 后的更新负责保持一致
        }

        updateDisplay();
        setInterval(updateDisplay, 1000);

        // ===== 顶部状态栏时间同步虚拟时钟 =====
        function updateStatusBarTime() {
            const el = document.getElementById('status-bar-time');
            if (!el) return;
            const d = new RealDate(getVirtualNowMs());
            const hh = pad(d.getHours());
            const mm = pad(d.getMinutes());
            el.textContent = `${hh}:${mm}`;
        }
        updateStatusBarTime();
        setInterval(updateStatusBarTime, 1000);

        // ===== 时间调整（只改时间） =====
        applyTimeBtn.addEventListener('click', () => {
            if (!datetimeInput.value) return;
            const localStr = datetimeInput.value;
            const localDate = new RealDate(localStr);
            if (isNaN(localDate.getTime())) return;
            setVirtualTime(localDate);
            updateDisplay();
            updateStatusBarTime();
        });

        // ===== 流速调整 =====
        function syncSpeedInputs(from) {
            let v = 1;
            if (from === 'range') {
                v = Number(speedRange.value);
                speedNumber.value = v.toFixed(1);
            } else if (from === 'number') {
                v = Number(speedNumber.value);
                if (!isFinite(v) || v <= 0) v = 1;
                if (v > 5) v = 5;
                if (v < 0.1) v = 0.1;
                speedRange.value = v;
                speedNumber.value = v.toFixed(1);
            }
        }

        speedRange.addEventListener('input', () => {
            syncSpeedInputs('range');
        });

        speedNumber.addEventListener('change', () => {
            syncSpeedInputs('number');
        });

        applySpeedBtn.addEventListener('click', () => {
            const v = Number(speedNumber.value);
            if (!isFinite(v) || v <= 0) return;
            setSpeed(v);

            // 手动把滑条和数字框更新为当前 speed（state.speed 里已经是最新的）
            speedRange.value = state.speed;
            speedNumber.value = state.speed.toFixed(1).replace(/\.0$/, '');

            updateDisplay();
            updateStatusBarTime();
        });

        resetSpeedBtn.addEventListener('click', () => {
            setSpeed(1);
            speedRange.value = state.speed;
            speedNumber.value = state.speed.toFixed(1).replace(/\.0$/, '');
            updateDisplay();
            updateStatusBarTime();
        });

        // ===== 重置虚拟时钟 =====
        resetBtn.addEventListener('click', () => {
            resetClock();
            datetimeInput.dataset.initialized = '';

            // 同步流速 UI（因为 resetClock 里 speed 也恢复 1）
            speedRange.value = state.speed;
            speedNumber.value = state.speed.toFixed(1).replace(/\.0$/, '');
            updateDisplay();
            updateStatusBarTime();
        });

        // ===== 悬浮按钮：按下 / 移动 / 松开（同时负责拖动 + 点击） =====
        let isPointerDown = false;
        let moved = false;
        let startX = 0;
        let startY = 0;
        let startRight = 0;
        let startBottom = 0;

        function onPointerDown(e) {
            e.preventDefault();
            const pointX = (e.touches ? e.touches[0].clientX : e.clientX);
            const pointY = (e.touches ? e.touches[0].clientY : e.clientY);

            const rect = btn.getBoundingClientRect();
            startX = pointX;
            startY = pointY;
            startRight = window.innerWidth - (rect.left + rect.width);
            startBottom = window.innerHeight - (rect.top + rect.height);

            isPointerDown = true;
            moved = false;
            btn.style.cursor = 'grabbing';

            window.addEventListener('mousemove', onPointerMove);
            window.addEventListener('mouseup', onPointerUp);
            window.addEventListener('touchmove', onPointerMove, { passive: false });
            window.addEventListener('touchend', onPointerUp);
        }

        function onPointerMove(e) {
            if (!isPointerDown) return;
            e.preventDefault();
            const pointX = (e.touches ? e.touches[0].clientX : e.clientX);
            const pointY = (e.touches ? e.touches[0].clientY : e.clientY);

            const dx = pointX - startX;
            const dy = pointY - startY;

            if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
                moved = true;
            }

            if (!moved) return;

            let newRight = startRight - dx;
            let newBottom = startBottom - dy;

            const margin = 4;
            const rect = btn.getBoundingClientRect();
            const w = rect.width;
            const h = rect.height;

            if (newRight < margin) newRight = margin;
            if (newRight > window.innerWidth - w - margin) {
                newRight = window.innerWidth - w - margin;
            }
            if (newBottom < margin) newBottom = margin;
            if (newBottom > window.innerHeight - h - margin) {
                newBottom = window.innerHeight - h - margin;
            }

            btn.style.right = newRight + 'px';
            btn.style.bottom = newBottom + 'px';

            if (panel.style.display === 'block') {
                positionPanel();
            }
        }

        function onPointerUp() {
            if (!isPointerDown) return;
            isPointerDown = false;
            btn.style.cursor = 'grab';

            window.removeEventListener('mousemove', onPointerMove);
            window.removeEventListener('mouseup', onPointerUp);
            window.removeEventListener('touchmove', onPointerMove);
            window.removeEventListener('touchend', onPointerUp);

            // 如果基本没动，就当作点击：开关面板
            if (!moved) {
                if (panel.style.display === 'none') {
                    panel.style.display = 'block';
                    positionPanel();
                } else {
                    panel.style.display = 'none';
                }
            }
        }

        btn.addEventListener('mousedown', onPointerDown);
        btn.addEventListener('touchstart', onPointerDown, { passive: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createClockUI);
    } else {
        createClockUI();
    }
})();
