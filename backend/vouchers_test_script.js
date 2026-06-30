import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const doc = new PDFDocument({ margin: 20, size: 'A4' });
const outputFilePath = 'vouchers_test.pdf';
const stream = fs.createWriteStream(outputFilePath);
doc.pipe(stream);

// Desain Grid Kartu Voucher (A4: 595 x 842 pt)
const cardWidth = 175;
const cardHeight = 98;
const cardsPerRow = 3;
const cardsPerPage = 21; // 3 x 7 grid
const spacingX = 15;
const spacingY = 12;

const startX = 25;
const startY = 30;

const drawWifiIcon = (x, y) => {
  const cx = x + 140; // posisi center X di kolom kanan
  const cy = y + 50;  // posisi center Y di kolom kanan

  // Draw dot
  doc.circle(cx, cy + 12, 2.2).fillColor('#4a5568').fill();

  // Draw arcs
  doc.lineWidth(1.8).lineCap('round').strokeColor('#4a5568');
  
  // Arc 1
  doc.path(`M ${cx - 6} ${cy + 6} A 8 8 0 0 1 ${cx + 6} ${cy + 6}`).stroke();
  
  // Arc 2
  doc.path(`M ${cx - 12} ${cy} A 16 16 0 0 1 ${cx + 12} ${cy}`).stroke();

  // Arc 3
  doc.path(`M ${cx - 18} ${cy - 6} A 24 24 0 0 1 ${cx + 18} ${cy - 6}`).stroke();
};

const vouchers = [
  { username: 'RKWWZK', password: 'RKWWZK', outletName: 'Kafe Sudut Kota', profile: { name: '1k', validity: '1d', sessionTimeout: '5h', description: 'Paket 1k' } },
  { username: 'ABCDEF', password: '123456', outletName: 'Kafe Sudut Kota', profile: { name: '3k', validity: '1d', sessionTimeout: '5h', description: 'Paket 3k' } },
  { username: 'XYZWKV', password: 'XYZWKV', outletName: 'Kafe Sudut Kota', profile: { name: '5k', validity: '1d', sessionTimeout: '5h', description: 'Paket 5k' } },
];

vouchers.forEach((voucher, index) => {
  const col = index % cardsPerRow;
  const row = Math.floor(index / cardsPerRow);

  const x = startX + col * (cardWidth + spacingX);
  const y = startY + row * (cardHeight + spacingY);

  // 1. Ekstrak data & tentukan harga / skema warna seperti Mikhmon
  let priceText = 'Rp 3.000';
  let color = '#009688'; // Default Teal

  const desc = (voucher.profile?.description || '').toLowerCase();
  const pName = (voucher.profile?.name || '').toLowerCase();

  if (desc.includes('1000') || pName.includes('1k') || pName.includes('1000')) {
    priceText = 'Rp 1.000';
    color = '#2196F3'; // Blue
  } else if (desc.includes('5000') || pName.includes('5k') || pName.includes('5000')) {
    priceText = 'Rp 5.000';
    color = '#FF9800'; // Orange
  } else if (desc.includes('3000') || pName.includes('3k') || pName.includes('3000')) {
    priceText = 'Rp 3.000';
    color = '#009688'; // Teal
  }

  // Format validity & durasi seperti template PHP Anda
  let validityText = 'Aktif: -';
  const val = voucher.profile?.validity || '1d';
  if (val.endsWith('d')) validityText = `Aktif:${val.slice(0, -1)}Hari`;
  else if (val.endsWith('h')) validityText = `Aktif:${val.slice(0, -1)}Jam`;
  else validityText = `Aktif:${val}`;

  let durationText = 'Durasi: -';
  const limit = voucher.profile?.sessionTimeout || '5h';
  if (limit.endsWith('h')) durationText = `Durasi:${limit.slice(0, -1)}Jam`;
  else if (limit.endsWith('d')) durationText = `Durasi:${limit.slice(0, -1)}Hari`;
  else durationText = `Durasi:${limit}`;

  const limitData = voucher.profile?.limitUplink || ''; // optional datalimit

  // 2. Menggambar Border Kartu
  doc
    .roundedRect(x, y, cardWidth, cardHeight, 4)
    .lineWidth(1)
    .strokeColor('#2d3748') // border hitam bersih sesuai template Anda
    .stroke();

  // 3. Kolom Kiri: Bar Vertikal Warna & Rotasi Harga
  doc
    .rect(x + 0.5, y + 0.5, 22, cardHeight - 1)
    .fillColor(color)
    .fill();

  // Menggambar garis pemisah bar harga
  doc
    .moveTo(x + 22.5, y)
    .lineTo(x + 22.5, y + cardHeight)
    .lineWidth(1)
    .strokeColor('#2d3748')
    .stroke();

  // Rotasi Text Harga (Sangat presisi, tengah, font-size 9 agar tidak terpotong)
  doc.save();
  doc.translate(x + 6.5, y + cardHeight - 8);
  doc.rotate(-90);
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor('#ffffff')
    .text(priceText, 0, 0, { align: 'center', width: cardHeight - 16 });
  doc.restore();

  // 4. Baris 1: Nama Hotspot & Icon WiFi (Kanan)
  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor('#2d3748')
    .text((voucher.outletName || 'WIFI HOTSPOT').toUpperCase(), x + 27, y + 6, {
      width: cardWidth - 87,
      ellipsis: true,
    });

  // Gambar WiFi Icon vector di sebelah kanan
  drawWifiIcon(x, y);

  // 5. Baris 2: Monospace Credentials (Tengah)
  const isVcMode = voucher.username === voucher.password;

  if (isVcMode) {
    // Mode Voucher Code saja (Monospace Besar)
    doc
      .fontSize(15)
      .font('Courier-Bold')
      .fillColor('#000000')
      .text(voucher.username, x + 27, y + 25, {
        width: cardWidth - 87,
        align: 'center',
      });
  } else {
    // Mode Username + Password
    doc
      .fontSize(9.5)
      .font('Courier-Bold')
      .fillColor('#000000')
      .text(`U: ${voucher.username}`, x + 27, y + 21, {
        width: cardWidth - 87,
        align: 'center',
      });
    doc
      .fontSize(9.5)
      .font('Courier-Bold')
      .fillColor('#000000')
      .text(`P: ${voucher.password}`, x + 27, y + 33, {
        width: cardWidth - 87,
        align: 'center',
      });
  }

  // 6. Baris 3: Detail Paket (Validity, Duration, Datalimit)
  const detailParts = [validityText, durationText];
  if (limitData) detailParts.push(limitData);
  
  doc
    .fontSize(7.5)
    .font('Helvetica')
    .fillColor('#2d3748')
    .text(detailParts.join(' '), x + 27, y + 54, {
      width: cardWidth - 87,
    });

  // 7. Baris 4 & Footer: Info Portal Login & No Index
  const serverHost = 'wifi.net';
  const numLabel = `[${index + 1}]`;

  doc
    .fontSize(7)
    .font('Helvetica')
    .fillColor('#2d3748')
    .text(`Login: http://${serverHost}`, x + 27, y + 74, {
      width: cardWidth - 32,
    });

  // Draw No Index di pojok kanan bawah
  doc
    .fontSize(6)
    .font('Helvetica')
    .fillColor('#718096')
    .text(numLabel, x + cardWidth - 25, y + cardHeight - 11, {
      width: 20,
      align: 'right',
    });
});

doc.end();
console.log('PDF Generated successfully to ' + outputFilePath);
