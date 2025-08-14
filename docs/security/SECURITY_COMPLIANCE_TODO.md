# Security & Compliance TODO (ISO 27001 / GDPR / ISO 9001 / CPRA Readiness)

## 1. Access Control & Authentication
- [ ] Role-based access control (RBAC)
- [ ] Multi-factor authentication (MFA) for all privileged accounts
- [ ] Least-privilege principle for all system components
- [ ] Access reviews: quarterly for privileged accounts
- [ ] Automated account deactivation for inactive users

## 2. Data Protection & Encryption
- [ ] Data encryption at rest (AES-256 or equivalent)
- [ ] Data encryption in transit (TLS 1.2+)
- [ ] Key rotation policy & HSM-backed storage
- [ ] Secure backup & restore testing (quarterly)
- [ ] Data minimization practices documented

## 3. Audit & Logging
- [ ] Audit trail table for create/update/delete and privilege changes
- [ ] Immutable copy of logs (Azure Blob immutability or equivalent)
- [ ] User-facing activity history (their own actions)
- [ ] Provider admin dashboard: metadata only (zero-knowledge)
- [ ] Centralized logging with SIEM integration

## 4. GDPR Compliance
- [ ] Privacy policy: zero-knowledge, controller/processor clarity
- [ ] Right to be forgotten (delete/anonymize) + test plan
- [ ] Data export (JSON/CSV) + test plan
- [ ] Retention schedule for logs & data; documented & enforced
- [ ] Data Protection Impact Assessment (DPIA) process in place

## 5. ISO 9001 – Quality Management
- [ ] Maintain documented Quality Management System (QMS)
- [ ] Define quality objectives with measurable KPIs
- [ ] Documented processes for development, testing, and release
- [ ] Formal corrective & preventive action (CAPA) process
- [ ] Periodic internal quality audits (at least annually)
- [ ] Supplier/vendor quality evaluation process
- [ ] Management review meetings with documented outputs
- [ ] Customer feedback process & resolution tracking

## 6. CPRA – California Privacy Rights Act
- [ ] Update privacy notice to reflect CPRA-specific rights
- [ ] Provide clear opt-out for “sale” or “sharing” of personal data
- [ ] Support right to limit use of sensitive personal information
- [ ] Mechanism to process “Do Not Sell or Share” requests
- [ ] Handle requests for correction of personal data
- [ ] Annual CPRA-specific privacy training for relevant staff
- [ ] Data processing agreements updated for CPRA compliance
- [ ] Maintain a record of all CPRA-related requests and responses
