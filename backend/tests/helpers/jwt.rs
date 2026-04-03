use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use jsonwebtoken::jwk::{
    AlgorithmParameters, CommonParameters, Jwk, JwkSet, KeyAlgorithm, PublicKeyUse,
    RSAKeyParameters,
};
use jsonwebtoken::{encode, EncodingKey, Header};
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::traits::PublicKeyParts;
use rsa::RsaPrivateKey;
use serde::Serialize;

pub const TEST_KID: &str = "test-key-1";
pub const TEST_ISSUER: &str = "http://localhost:0/realms/klassenzeit";
pub const TEST_CLIENT_ID: &str = "klassenzeit-test";

pub struct TestKeyPair {
    pub encoding_key: EncodingKey,
    pub jwk_set: JwkSet,
}

impl TestKeyPair {
    pub fn generate() -> Self {
        let mut rng = rand::thread_rng();
        let private_key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let private_pem = private_key
            .to_pkcs1_pem(rsa::pkcs1::LineEnding::LF)
            .unwrap();
        let encoding_key = EncodingKey::from_rsa_pem(private_pem.as_bytes()).unwrap();

        let public_key = private_key.to_public_key();
        let n = URL_SAFE_NO_PAD.encode(public_key.n().to_bytes_be());
        let e = URL_SAFE_NO_PAD.encode(public_key.e().to_bytes_be());

        let jwk = Jwk {
            common: CommonParameters {
                public_key_use: Some(PublicKeyUse::Signature),
                key_algorithm: Some(KeyAlgorithm::RS256),
                key_id: Some(TEST_KID.to_string()),
                ..Default::default()
            },
            algorithm: AlgorithmParameters::RSA(RSAKeyParameters {
                key_type: Default::default(),
                n,
                e,
            }),
        };

        Self {
            encoding_key,
            jwk_set: JwkSet { keys: vec![jwk] },
        }
    }

    pub fn create_token(&self, claims: &impl Serialize) -> String {
        let mut header = Header::new(jsonwebtoken::Algorithm::RS256);
        header.kid = Some(TEST_KID.to_string());
        encode(&header, claims, &self.encoding_key).unwrap()
    }
}
