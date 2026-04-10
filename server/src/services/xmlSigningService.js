/**
 * XML SIGNING SERVICE
 * Firma documenti XML con firma digitale XAdES-BES (enveloped)
 * usando il certificato dispositivo AdE (X.509/PFX).
 *
 * XAdES-BES: XML Advanced Electronic Signature, Baseline-B profile.
 * Obbligatorio per la trasmissione di fatture e corrispettivi al SDI.
 *
 * Dipendenze: xml-crypto, node-forge
 *
 * Nota: per la trasmissione via API AdE con mTLS, il server AdE
 * autentica la chiamata tramite il certificato client TLS.
 * La firma XAdES-BES aggiuntiva sull'XML è richiesta per i file
 * inviati al SDI tramite il canale API.
 */

const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Carica il certificato PFX e restituisce chiave privata + certificato PEM.
 * @param {string} pfxPath - Percorso al file PFX
 * @param {string} password - Password del PFX
 * @returns {{ privateKeyPem: string, certPem: string, cert: forge.pki.Certificate }}
 */
function loadPfx(pfxPath, password) {
  let pfxBuffer;
  try {
    pfxBuffer = fs.readFileSync(pfxPath);
  } catch (err) {
    throw new Error(`Impossibile leggere il certificato da "${pfxPath}": ${err.message}`);
  }

  const pfxDer = forge.util.createBuffer(pfxBuffer.toString('binary'));
  const pfxAsn1 = forge.asn1.fromDer(pfxDer);

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password || '');
  } catch (err) {
    throw new Error(`Impossibile aprire il certificato PFX (password errata o file corrotto): ${err.message}`);
  }

  // Estrae chiave privata
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) {
    throw new Error('Chiave privata non trovata nel certificato PFX.');
  }
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);

  // Estrae certificato X.509
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) {
    throw new Error('Certificato X.509 non trovato nel file PFX.');
  }
  const certPem = forge.pki.certificateToPem(certBag.cert);

  return { privateKeyPem, certPem, cert: certBag.cert };
}

/**
 * Calcola il digest SHA-256 in base64 di una stringa.
 */
function sha256Base64(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('base64');
}

/**
 * Firma un documento XML con XAdES-BES (enveloped signature).
 *
 * La firma è conforme ai requisiti minimi XAdES-B-B (Baseline B-Level):
 * - SignedInfo con canonicalizzazione C14N 1.0
 * - Reference all'intero documento (URI="")
 * - Transform enveloped-signature
 * - DigestMethod SHA-256
 * - SignatureMethod RSA-SHA256
 * - SignedProperties con SigningTime e SigningCertificateV2
 *
 * @param {string} xmlString  - XML da firmare
 * @param {string} pfxPath    - Percorso al PFX del consulente
 * @param {string} pfxPassword - Password del PFX
 * @returns {Promise<string>}  - XML firmato
 */
async function signXml(xmlString, pfxPath, pfxPassword) {
  const { privateKeyPem, certPem, cert } = loadPfx(pfxPath, pfxPassword);

  // Calcola SigningTime
  const signingTime = new Date().toISOString();

  // Digest del certificato per XAdES SigningCertificateV2
  const certDer = forge.util.decode64(
    certPem
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .replace(/\s/g, '')
  );
  const certDigest = crypto.createHash('sha256').update(Buffer.from(certDer, 'binary')).digest('base64');

  // Serial number e issuer del certificato
  const issuerDN = cert.issuer.attributes
    .map((a) => `${a.shortName}=${a.value}`)
    .reverse()
    .join(',');
  const serialNumber = cert.serialNumber;

  // ID univoco per gli elementi della firma
  const signatureId = `Signature-${Date.now()}`;
  const signedPropsId = `SignedProperties-${signatureId}`;

  // Costruisce il blocco QualifyingProperties (XAdES-BES)
  const qualifyingProps = `<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#${signatureId}">` +
    `<xades:SignedProperties Id="${signedPropsId}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
    `<xades:SigningCertificateV2>` +
    `<xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certDigest}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerialV2>` +
    `<xades:IssuerDNString>${issuerDN}</xades:IssuerDNString>` +
    `<xades:SerialNumber>${serialNumber}</xades:SerialNumber>` +
    `</xades:IssuerSerialV2>` +
    `</xades:Cert>` +
    `</xades:SigningCertificateV2>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>` +
    `</xades:QualifyingProperties>`;

  // Configura xml-crypto per firma enveloped
  const sig = new SignedXml({
    idAttribute: 'Id',
    privateKey: privateKeyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
  });

  // Reference 1: il documento completo (URI="")
  sig.addReference({
    xpath: '/*',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    uri: ''
  });

  // Reference 2: SignedProperties (XAdES-BES richiede questa reference)
  sig.addReference({
    xpath: `//*[@Id='${signedPropsId}']`,
    transforms: ['http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    uri: `#${signedPropsId}`,
    isEmptyUri: false
  });

  sig.computeSignature(xmlString, {
    prefix: 'ds',
    attrs: { Id: signatureId },
    location: { reference: '/*', action: 'append' }
  });

  let signedXml = sig.getSignedXml();

  // Inietta QualifyingProperties all'interno dell'elemento Signature
  // (necessario per XAdES — xml-crypto non lo gestisce nativamente)
  signedXml = signedXml.replace(
    `<ds:SignatureValue`,
    `<ds:Object>${qualifyingProps}</ds:Object><ds:SignatureValue`
  );

  return signedXml;
}

/**
 * Verifica se il certificato PFX è valido e non scaduto.
 * @param {string} pfxPath
 * @param {string} pfxPassword
 * @returns {{ valido: boolean, soggetto: string, scadenza: Date, emittente: string }}
 */
function verificaCertificato(pfxPath, pfxPassword) {
  try {
    const { cert } = loadPfx(pfxPath, pfxPassword);
    const now = new Date();
    const scadenza = new Date(cert.validity.notAfter);
    const valido = now >= new Date(cert.validity.notBefore) && now <= scadenza;

    const soggetto = cert.subject.attributes
      .map((a) => `${a.shortName}=${a.value}`)
      .join(', ');
    const emittente = cert.issuer.attributes
      .map((a) => `${a.shortName}=${a.value}`)
      .join(', ');

    return { valido, soggetto, scadenza, emittente };
  } catch (err) {
    return { valido: false, errore: err.message };
  }
}

module.exports = { signXml, verificaCertificato, loadPfx };
