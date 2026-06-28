const { hashPassword }    = require("../src/utils/passwordUtils");
const db                  = require("../src/db/database");
const { encryptPrivateKey } = require("../src/services/walletService");
const { ethers }          = require("ethers");

const testUsers = [
  // Admin
  { email: "admin@magna-caas.com",              password: "Admin@MagnaCaaS2026!",  fullName: "System Admin",           role: "admin",              oemTenant: "magna",     privateKey: null },

  // Engineers (ENGINEER_ROLE — OTA, supply chain, software activations)
  { email: "stefan.weber@magna.com",            password: "Eng@Stefan2026!",       fullName: "Stefan Weber",           role: "engineer",           oemTenant: "magna",     privateKey: "0xa4548ab4b1ee56838dcf3f916a22a52d991de6340ce893fdc31d7c5c1ffb2ef9" },
  { email: "yuki.tanaka@magna.com",             password: "Eng@Yuki2026!",         fullName: "Yuki Tanaka",            role: "engineer",           oemTenant: "magna",     privateKey: "0x3cd940c0e5c10159094c513eb8cbfd7de8660430c09b271bce24fae18be10794" },

  // Compliance Officers (COMPLIANCE_OFFICER_ROLE — AI decisions, incident evidence)
  { email: "claire.dubois@magna.com",           password: "CO@Claire2026!",        fullName: "Claire Dubois",          role: "compliance_officer", oemTenant: "magna",     privateKey: "0x41af26a4a686dca3b64232249eca1b04e8b259b4ddb39d14b4411d475ab8557a" },
  { email: "james.okafor@magna.com",            password: "CO@James2026!",         fullName: "James Okafor",           role: "compliance_officer", oemTenant: "magna",     privateKey: "0xe0ac12a1fa5bb84c8fe825867316511186a2865e4a500a2bbd071c4975bb720f" },

  // Auditors (AUDITOR_ROLE — compliance summary)
  { email: "anna.schmidt@compliance.magna.com", password: "Audit@Anna2026!",       fullName: "Anna Schmidt",           role: "auditor",            oemTenant: "magna",     privateKey: "0xcab62e5cbebf57e858730b85e4b871186bfa0c3d156a9b3053657b82ebfb9463" },
  { email: "peter.kowalski@compliance.magna.com", password: "Audit@Peter2026!",    fullName: "Peter Kowalski",         role: "auditor",            oemTenant: "magna",     privateKey: "0x7c047d8dfb1437a4ca3f22a8502e2871c37f69e1baef04208b07771f31f763a7" },

  // Regulators (REGULATOR_ROLE — read-only, regulatory context)
  { email: "inspector@unece.org",               password: "Reg@UNECE2026!",        fullName: "UNECE Inspector",        role: "regulator",          oemTenant: "unece",     privateKey: "0xc3d97a42d207084c46bdfd4249dd915aac44715a68e3c946f3bc917ecd56205b" },
  { email: "auditor@eu-ai-office.europa.eu",    password: "Reg@EUAIAct2026!",     fullName: "EU AI Office Auditor",   role: "regulator",          oemTenant: "eu_ai_act", privateKey: "0xa9ec81621e6c3ad79ecfda1ae512545b15c67ba8585b11a4473a88597c1f6b2b" },

  // OEM contacts (pending — must be approved)
  { email: "sw.ops@bmw-group.de",               password: "BMW@Pending2026!",      fullName: "BMW Software Ops",       role: "pending",            oemTenant: "bmw",       privateKey: null },
  { email: "compliance@mercedes-benz.com",      password: "MB@Pending2026!",       fullName: "Mercedes Compliance",    role: "pending",            oemTenant: "mercedes",  privateKey: null },
];

async function seedUsers(silent = false) {
  const upsert = db.prepare(`
    INSERT INTO users
      (email, password_hash, full_name, role, oem_tenant, wallet_address, encrypted_private_key, wallet_iv, wallet_auth_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      password_hash         = excluded.password_hash,
      full_name             = excluded.full_name,
      role                  = excluded.role,
      oem_tenant            = excluded.oem_tenant,
      wallet_address        = excluded.wallet_address,
      encrypted_private_key = excluded.encrypted_private_key,
      wallet_iv             = excluded.wallet_iv,
      wallet_auth_tag       = excluded.wallet_auth_tag,
      updated_at            = datetime('now')
  `);

  for (const u of testUsers) {
    const hash    = await hashPassword(u.password);
    const pk      = u.privateKey ?? ethers.Wallet.createRandom().privateKey;
    const address = new ethers.Wallet(pk).address;
    const { encrypted, iv, authTag } = encryptPrivateKey(pk);
    upsert.run(u.email, hash, u.fullName, u.role, u.oemTenant, address, encrypted, iv, authTag);
    if (!silent) console.log(`✓ ${u.role.padEnd(20)} ${u.email}  →  ${address}`);
  }

  if (!silent) console.log("\nDone. All Magna CaaS users seeded.");
}

module.exports = { seedUsers };

if (require.main === module) {
  (async () => {
    try {
      await db.init();
      await seedUsers();
      process.exit(0);
    } catch (err) {
      console.error("Seeding failed:", err);
      process.exit(1);
    }
  })();
}
