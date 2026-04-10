import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Pastikan .env diload dari root folder backend
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { db, COLLECTIONS } from '../config/firebase.config';

async function initDB() {
  console.log('🚀 Memulakan proses memasukkan data ujian ke Firebase...');

  try {
    // 1. Cipta Pekerja Ujian
    const employeeId = 'E001';
    const pinPlain = '123456';
    const pinHashed = await bcrypt.hash(pinPlain, 10);

    const employeeRef = db.collection(COLLECTIONS.EMPLOYEES).doc(employeeId);
    await employeeRef.set({
      employeeId: employeeId,
      name: 'Ahmad bin Ali',
      icNumber: '900101-14-5555',
      department: 'Pembinaan',
      pin: pinHashed,
      role: 'WORKER',
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    console.log(`✅ Pekerja dicipta: ID [${employeeId}] | PIN [${pinPlain}]`);

    // 2. Cipta Tapak Projek Ujian (Contoh: Menara Berkembar KLCC)
    const siteId = 'S001';
    const siteRef = db.collection(COLLECTIONS.PROJECT_SITES).doc(siteId);
    await siteRef.set({
      siteId: siteId,
      name: 'Tapak Projek KLCC (Ujian)',
      latitude: 3.15785, // Koordinat KLCC
      longitude: 101.71165,
      geofenceRadius: 3000, // 3 Kilometer radius (Sengaja dibesarkan untuk mudahkan ujian pertama)
      status: 'ACTIVE',
      createdAt: Date.now()
    });
    console.log(`✅ Tapak Projek dicipta: ID [${siteId}] (KLCC, Radius besar 3km untuk ujian)`);

    console.log('\n🎉 PROSES SELESAI! Firebase anda kini mempunyai data asas.');
    console.log('Anda kini boleh log masuk menggunakan peranti bimbit anda.');
    console.log('Sila tekan [Ctrl + C] jika proses ini tidak tamat dengan sendirinya.');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ RALAT: Gagal memasukkan data ujian. Sila pastikan:');
    console.error('1. Anda telah muat turun service-account.json');
    console.error('2. service-account.json berada di folder /backend/');
    console.error('3. FIREBASE_PROJECT_ID telah disetkan dengan betul di fail .env');
    console.error('\nMaklumat Ralat Lengkap:', error);
    process.exit(1);
  }
}

initDB();
