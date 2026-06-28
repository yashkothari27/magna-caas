const crypto = require("crypto");

async function uploadJSONToIPFS(obj, name) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT environment variable not set");

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pinataMetadata: { name }, pinataContent: obj }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata JSON upload failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.IpfsHash;
}

async function uploadToIPFS(fileBuffer, filename, mimeType) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT environment variable not set");

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([fileBuffer], { type: mimeType || "application/octet-stream" }),
    filename
  );
  formData.append("pinataMetadata", JSON.stringify({ name: filename }));

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata upload failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const cid  = data.IpfsHash;
  return {
    cid,
    ipfsUrl:   `https://ipfs.io/ipfs/${cid}`,
    pinataUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
  };
}

function computeSHA256(buffer) {
  return "0x" + crypto.createHash("sha256").update(buffer).digest("hex");
}

module.exports = { uploadToIPFS, uploadJSONToIPFS, computeSHA256 };
