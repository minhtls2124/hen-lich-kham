/**
 * BACKEND ĐẶT LỊCH KHÁM - PHÒNG KHÁM CƠ XƯƠNG KHỚP TS.BS PHẠM THỊ LAN
 * Lưu lịch hẹn vào Google Sheet, chống đặt trùng giờ bằng LockService.
 * Cách cài đặt: xem HUONG-DAN.md
 *
 * Cấu hình lịch bên dưới PHẢI KHỚP với CONFIG trong dat-lich.html.
 */
const SHEET_NAME = 'LichHen';
const TZ = 'Asia/Ho_Chi_Minh';
const SLOT_MINUTES = 20;
const SESSIONS = [['07:30', '11:30'], ['13:30', '17:30']];
const WORK_DAYS = [1, 2, 3, 4, 5, 6];   // 0 = Chủ nhật
const HOLIDAYS = ['2027-01-01'];        // YYYY-MM-DD
const DAYS_AHEAD = 14;
const MIN_LEAD_MINUTES = 60;
const CANCEL_BEFORE_MINUTES = 120;
const NOTIFY_EMAIL = '';                // điền email để nhận thông báo khi có lịch mới (để trống = tắt)

const HEADERS = ['Mã', 'Ngày khám', 'Giờ khám', 'Họ tên', 'SĐT', 'Năm sinh', 'Giới tính', 'Loại khám',
  'Vùng đau', 'Thời gian đau', 'Mức độ đau', 'Ghi chú', 'Trạng thái', 'Thời điểm đặt'];
const COL = { code: 0, date: 1, time: 2, fullname: 3, phone: 4, status: 12 };
const STATUS_CANCELLED = 'Đã hủy';

/* ----------------- tiện ích ----------------- */
const pad_ = n => String(n).padStart(2, '0');
const toMin_ = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const toHHMM_ = m => pad_(Math.floor(m / 60)) + ':' + pad_(m % 60);
const ALL_SLOTS = SESSIONS.flatMap(([s, e]) => {
  const out = [];
  for (let t = toMin_(s); t + SLOT_MINUTES <= toMin_(e); t += SLOT_MINUTES) out.push(toHHMM_(t));
  return out;
});
const weekday_ = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
const addDays_ = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isWorkDay_ = iso => WORK_DAYS.indexOf(weekday_(iso)) >= 0 && HOLIDAYS.indexOf(iso) < 0;

function now_() {
  const d = new Date();
  return { date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), minutes: toMin_(Utilities.formatDate(d, TZ, 'HH:mm')) };
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function normalizePhone_(raw) {
  let p = String(raw || '').replace(/[\s.\-()]/g, '');
  if (p.indexOf('+84') === 0) p = '0' + p.slice(3);
  else if (/^84\d{9}$/.test(p)) p = '0' + p.slice(2);
  return p;
}
const validPhone_ = p => /^0[35789]\d{8}$/.test(p) || /^02\d{9}$/.test(p);
// Chống chèn công thức vào Sheet + giới hạn độ dài
function clean_(v, max) {
  let s = String(v == null ? '' : v).trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
// Sheet có thể tự đổi "2026-10-28" / "07:30" sang kiểu Date — chuẩn hóa lại
function cellDate_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v).trim(); }
function cellTime_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v).trim().slice(0, 5); }
function cellPhone_(v) { const s = String(v).replace(/\D/g, ''); return s && s[0] !== '0' ? '0' + s : s; }

// Dùng Sheet đang gắn script; nếu script tạo riêng ở script.google.com thì tự tạo Sheet mới và nhớ ID.
function spreadsheet_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (err) { }
  if (ss) return ss;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  ss = SpreadsheetApp.create('Lịch hẹn - PK TS.BS Phạm Thị Lan');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function sheet_() {
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange('A:N').setNumberFormat('@'); // lưu dạng văn bản: giữ số 0 đầu SĐT, ngày/giờ không bị đổi
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#e0f2fe');
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Chờ xác nhận', 'Đã xác nhận', 'Đã khám', STATUS_CANCELLED], true).build();
    sh.getRange('M2:M').setDataValidation(rule);
  }
  return sh;
}
function rows_(sh) {
  const values = sh.getDataRange().getValues().slice(1);
  return values.map((r, i) => ({
    row: i + 2, code: String(r[COL.code]).trim(), date: cellDate_(r[COL.date]), time: cellTime_(r[COL.time]),
    fullname: String(r[COL.fullname]), phone: cellPhone_(r[COL.phone]), status: String(r[COL.status]).trim()
  })).filter(r => r.code);
}
const active_ = r => r.status !== STATUS_CANCELLED;

/* ----------------- GET: lịch trống, tra cứu ----------------- */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'slots') {
      const today = now_().date;
      const from = /^\d{4}-\d{2}-\d{2}$/.test(p.from) ? p.from : today;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(p.to) ? p.to : addDays_(today, DAYS_AHEAD - 1);
      const booked = {};
      rows_(sheet_()).filter(r => active_(r) && r.date >= from && r.date <= to)
        .forEach(r => (booked[r.date] = booked[r.date] || []).push(r.time));
      return json_({ ok: true, booked });
    }
    if (p.action === 'lookup') {
      const phone = normalizePhone_(p.phone), code = String(p.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const r = rows_(sheet_()).find(x => x.code === code && x.phone === phone);
      if (!r) return json_({ ok: false, error: 'NOT_FOUND' });
      return json_({ ok: true, appointment: { code: r.code, date: r.date, time: r.time, fullname: r.fullname, status: r.status } });
    }
    return json_({ ok: true, service: 'dat-lich-kham', slots: ALL_SLOTS.length });
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', message: String(err) });
  }
}

/* ----------------- POST: đặt lịch, hủy lịch ----------------- */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'INVALID', message: 'Dữ liệu không hợp lệ' }); }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (err) { return json_({ ok: false, error: 'BUSY' }); }
  try {
    if (body.action === 'book') return json_(book_(body));
    if (body.action === 'cancel') return json_(cancel_(body));
    return json_({ ok: false, error: 'INVALID', message: 'action không hỗ trợ' });
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function book_(b) {
  const now = now_();
  const date = String(b.date || ''), time = String(b.time || '');
  const phone = normalizePhone_(b.phone);
  const fullname = clean_(b.fullname, 80).replace(/\s+/g, ' ');

  if (fullname.length < 2) return { ok: false, error: 'INVALID', message: 'Thiếu họ tên' };
  if (!validPhone_(phone)) return { ok: false, error: 'INVALID', message: 'Số điện thoại không hợp lệ' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < now.date || date > addDays_(now.date, DAYS_AHEAD - 1))
    return { ok: false, error: 'INVALID', message: 'Ngày khám ngoài phạm vi cho phép' };
  if (!isWorkDay_(date)) return { ok: false, error: 'INVALID', message: 'Phòng khám nghỉ ngày này' };
  if (ALL_SLOTS.indexOf(time) < 0) return { ok: false, error: 'INVALID', message: 'Giờ khám không hợp lệ' };
  if (date === now.date && toMin_(time) < now.minutes + MIN_LEAD_MINUTES) return { ok: false, error: 'SLOT_TAKEN' };

  const sh = sheet_();
  const rows = rows_(sh).filter(active_);
  if (rows.some(r => r.date === date && r.time === time)) return { ok: false, error: 'SLOT_TAKEN' };
  const dup = rows.find(r => r.date === date && r.phone === phone);
  if (dup) return { ok: false, error: 'DUPLICATE', time: dup.time };

  const used = {}; rows_(sh).forEach(r => used[r.code] = 1);
  let code;
  do { code = genCode_(); } while (used[code]);

  sh.appendRow([
    code, date, time, fullname, phone,
    clean_(b.birthYear, 4), clean_(b.gender, 10), clean_(b.visitType, 30), clean_(b.painArea, 200),
    clean_(b.duration, 50), clean_(b.painLevel, 2), clean_(b.note, 500),
    'Chờ xác nhận', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss')
  ]);

  if (NOTIFY_EMAIL) {
    try {
      MailApp.sendEmail(NOTIFY_EMAIL, `[Lịch mới] ${time} ${date} - ${fullname}`,
        `Mã: ${code}\nNgày: ${date}  Giờ: ${time}\nBệnh nhân: ${fullname}\nSĐT: ${phone}\n` +
        `Vùng đau: ${b.painArea || '-'}\nThời gian đau: ${b.duration || '-'}\nMức độ đau: ${b.painLevel || '-'}\nGhi chú: ${b.note || '-'}\n\n` +
        `Mở Google Sheet để xác nhận lịch.`);
    } catch (err) { /* bỏ qua lỗi gửi mail */ }
  }
  return { ok: true, code };
}

function cancel_(b) {
  const phone = normalizePhone_(b.phone), code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sh = sheet_();
  const r = rows_(sh).find(x => x.code === code && x.phone === phone);
  if (!r) return { ok: false, error: 'NOT_FOUND' };
  if (r.status === STATUS_CANCELLED) return { ok: true, appointment: { status: STATUS_CANCELLED } };
  const now = now_();
  const late = r.status === 'Đã khám' || r.date < now.date ||
    (r.date === now.date && toMin_(r.time) - now.minutes < CANCEL_BEFORE_MINUTES);
  if (late) return { ok: false, error: 'TOO_LATE' };
  sh.getRange(r.row, COL.status + 1).setValue(STATUS_CANCELLED);
  return { ok: true, appointment: { status: STATUS_CANCELLED } };
}

function genCode_() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = 'PL';
  for (let i = 0; i < 6; i++) c += A[Math.floor(Math.random() * A.length)];
  return c;
}

/** Chạy hàm này 1 lần trong trình soạn Apps Script để tạo sheet và cấp quyền. */
function setup() {
  const sh = sheet_();
  if (NOTIFY_EMAIL) MailApp.getRemainingDailyQuota();
  Logger.log('OK! Dữ liệu lịch hẹn lưu tại tab "%s" của Google Sheet: %s', SHEET_NAME, sh.getParent().getUrl());
  Logger.log('Mỗi ngày có %s khung khám %s phút.', ALL_SLOTS.length, SLOT_MINUTES);
}
