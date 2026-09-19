# Supabase database certificate

`supabase-ca.crt` is the public Supabase Root 2021 CA, downloaded over HTTPS from
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt.
It is a public trust certificate, not a private key or database credential.

SHA-256 certificate fingerprint:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
Expires 26 April 2031. Refresh this certificate from Supabase when they rotate
their CA. See https://supabase.com/docs/guides/platform/ssl-enforcement.
