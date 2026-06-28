const { ethers } = require("ethers");
const crypto     = require("crypto");
const config     = require("../config");

function _getEncryptionKey() {
  if (!config.walletEncryptionKey) {
    throw new Error("WALLET_ENCRYPTION_KEY is not set in environment");
  }
  return Buffer.from(config.walletEncryptionKey, "hex");
}

function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, privateKey: wallet.privateKey };
}

function encryptPrivateKey(privateKey) {
  const key = _getEncryptionKey();
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  return {
    encrypted: encrypted.toString("hex"),
    iv:        iv.toString("hex"),
    authTag:   cipher.getAuthTag().toString("hex"),
  };
}

function decryptPrivateKey(encrypted, iv, authTag) {
  const key = _getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function getWalletForUser(user, provider) {
  const privateKey = decryptPrivateKey(
    user.encrypted_private_key,
    user.wallet_iv,
    user.wallet_auth_tag
  );
  return new ethers.Wallet(privateKey, provider);
}

module.exports = { generateWallet, encryptPrivateKey, decryptPrivateKey, getWalletForUser };
