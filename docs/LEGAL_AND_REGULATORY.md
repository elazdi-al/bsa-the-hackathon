# Swissquote Wallet: legal and regulatory briefing

Research checked on **10 October 2026**. Scope: the wallet in [PROPOSAL.md](../PROPOSAL.md), the wallet-independent [compliance component](COMPLIANCE.md), the subsequently added [wallet backend](../WALLET.md), and the proposed commercial extensions.

This is a research and engineering briefing, not a legal opinion, FINMA approval or a statement that Swissquote has agreed to launch this product. Swiss counsel and Swissquote's compliance, risk, privacy and accounting teams must approve the actual entity, contracts, architecture and transaction flows before production. Recommendations below are project analysis, not claims that a particular technical implementation is legally mandated or regulator-approved.

Use current legislation first, then supervisory guidance; historical reports and consultation drafts provide context, not exemptions. German, French and Italian Swiss legal texts are authoritative; English translations are informational and can lag. The current AMLA and AMLO texts checked here incorporate the **1 October 2026** amendments. [FINMA's amendment notice](https://www.finma.ch/en/documentation/dossier/dossier-geldwaeschereibekaempfung/hinweise-zur-revision-des-geldwaeschereigesetzes-und-der-geldwaeschereiverordnung/)

## 1. Executive conclusion

The defensible proposition is **client-controlled assets with regulated bank assistance**, not an unregulated wallet operated by a bank.

- Genuine client-only signing through S1 + S3 supports a non-custodial argument. It does not establish the legal classification by itself, or automatically remove accounting, operational-risk and insolvency questions.
- A continuing service that assists third-party crypto transfers can fall within Swiss AML rules even without unilateral control. The co-signer therefore needs substantive bank compliance integration, not just an address-screening API. [AMLO, Art. 4(1)(b)](https://www.fedlex.admin.ch/eli/cc/2015/791/de)
- Creating a key during a bank session is useful evidence, not automatic FINMA acceptance of ownership verification. Safe ownership, client identity and beneficial ownership are different questions.
- A dApp allowlist, simulation and sanctions result help control assistance. None independently establishes that the underlying service, recipient or payment is legally permissible.
- Staking, lending, collateral vaults, swaps, cards and wealth-management services require separate product assessments. A non-custodial interface does not exempt those activities.

Recommended first product: a Swiss-client wallet with approved assets, verified own-wallet transfers, tightly scoped bank-assisted payments and a small reviewed dApp catalogue. Keep loans, investment vaults and card conversion as separately approved later products.

## 2. Architecture assumptions and responsibility

The proposal uses a 2-of-3 threshold ECDSA key as the single owner of a Safe account:

| Path | Participants | Consequence for this analysis |
| --- | --- | --- |
| Ordinary operation | S1 on the device + S2 at Swissquote | Swissquote actively assists and can refuse this signing path. |
| Lost-device recovery | S2 + client-decrypted S3 | Recovery must not let Swissquote or its suppliers obtain the second usable share without the client. |
| Independent operation | S1 + client-decrypted S3 | Client access must actually work without Swissquote authentication, servers or sponsorship. |
| Escrow | Independent partner holds encrypted S3 | Encryption does not automatically settle the partner's regulatory role, availability or insolvency treatment. |

These are proposed properties, not conclusions established by the compliance component. In particular, the proposal creates S1 and S3 on the same phone during onboarding. A compromised ceremony can expose two shares: threshold mathematics does not make those two parties operationally independent.

Before legal classification, produce a control inventory covering share access, passkey recovery, administrative permissions, Safe modules/guards, upgrade rights, escrow release rules, software updates and vendor access. Test the independent path with bank services unavailable. Include token-issuer restrictions and chain dependencies: even a client-controlled Safe does not make USDC or its network uncensorable.

Swissquote retains responsibility for its bank service; outsourcing a check does not itself transfer that responsibility. Each escrow, screening, RPC, bundler, cloud and identity provider needs a role and outsourcing assessment. SRO affiliation, where relevant, concerns AML supervision; it is not equivalent to prudential bank supervision. [FINMA outsourcing framework](https://www.finma.ch/en/news/2017/12/20171205-mm-rs-outsourcing/), [FINMA Guidance 01/2026](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20260112-finma-aufsichtsmitteilung-01-2026.pdf)

### 2.1 Important implementation divergence

The wallet backend added in commit `7f25634` is **not the Safe/client-encrypted-S3 architecture described above**. Static inspection of its notes and code shows:

| Topic | Newly added backend | Legal/design consequence |
| --- | --- | --- |
| Account | Custom `SwissquoteAccount`, with MPC plus an on-chain passkey check for normal operations | Review this contract and its actual permissions; do not inherit a Safe assessment automatically. |
| Third share | Share C held by the partner service and encrypted with the service's at-rest key | Not client-only encrypted escrow. The bank and partner can produce an MPC signature; additional account factors are the claimed asset-control barrier. |
| Recovery | Bank + partner MPC signature plus the client's offline confirmation-key signature, followed by delay | Analyse the confirmation key and on-chain recovery path, not the proposal's synced recovery-passkey model. |
| Cancellation | Swissquote's guardian can cancel pending recovery | The bank has a recovery veto; this does not by itself allow ordinary spending, but invalidates an unqualified no-lockout claim. |
| Independent use | Partner service rejects normal signing, recovery requires Swissquote approval, and the reviewed phone SDK exposes bank-assisted normal signing | No demonstrated bank-independent client signing path in these reviewed files. Do not claim that proposal S1 + S3 rescue is already implemented. |

Evidence: [backend notes](../WALLET.md), [account contract](../contracts/src/SwissquoteAccount.sol), [signer authorisation](../services/signer/server.ts) and [phone SDK](../lib/wallet/client.ts). This is a source-level comparison, not a contract audit or verified deployment result.

The backend also has a separate [wallet policy implementation](../lib/wallet/api/policy.ts); it does not import the independent compliance engine reviewed in this briefing. Its FX assumptions are mocked. Do not assume the stricter component's receipts, simulations, replay/spending responsibilities or coverage have been integrated merely because both are in the repository.

Before presenting the whole system as self-custodial, reconcile these architectures and test bank refusal/shutdown, partner refusal and guardian veto explicitly. The ability to prevent unilateral theft and the ability to transact without the bank are different properties. The legal conclusions must follow the chosen implementation, not the preferred diagram.

## 3. Custody, insolvency, capital and ownership

### 3.1 The non-custodial argument is conditional

**Project assessment:** the argument is stronger if only the client can decrypt S3, Swissquote cannot replace that authentication, no bank-controlled module can transfer funds or change ownership, and the client has a usable independent signing route. A provider's contractual powers and practical access matter alongside the number of shares.

Do not equate these four statements:

1. Swissquote cannot sign alone.
2. Swissquote is not providing custody under the applicable law.
3. Wallet assets are excluded from a provider's insolvency estate.
4. The bank has no related capital or accounting obligation.

The first is a technical property; the others require legal and accounting analysis of the complete arrangement.

### 3.2 The relevant Swiss framework

The Banking Act addresses segregable crypto custody assets through **Art. 16 no. 1bis and Art. 37d**. The statutory conditions include an undertaking to keep assets available and identifiable allocation to clients. For non-bank insolvency, **SchKG Art. 242a** addresses delivery of cryptoassets controlled by the bankrupt party; **Art. 242b** separately concerns access to data. Neither is a blanket guarantee that a backup service remains operational. [Banking Act](https://www.fedlex.admin.ch/eli/cc/51/117_121_129/de), [Debt Enforcement and Bankruptcy Act](https://www.fedlex.admin.ch/eli/cc/11/529_488_529/de)

FINMA's January 2026 guidance distinguishes custody and related arrangements. Segregable bank custody assets generally do not require capital against those assets, subject to the specified statutory exception; foreign custody adds supervision and bankruptcy-protection conditions. This is a conditional custody framework, not proof that the proposed wallet falls outside it. [FINMA Guidance 01/2026, section 3.1](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20260112-finma-aufsichtsmitteilung-01-2026.pdf)

Recommended legal deliverables:

- A factual custody/control opinion for normal use, recovery and independent use.
- Separate treatment of bank custody before withdrawal, wallet balances, staked assets, pledged collateral and any assets received on liquidation.
- Accounting and prudential analysis for each relevant bank exposure, including credit and operational risk.
- Escrow access, portability and insolvency arrangements; a recovery-kit drill independent of the partner.
- Customer disclosures separating self-custody, any custodial services, investment risk and deposit protection. Do not promise deposit insurance or guaranteed recovery of wallet crypto.

### 3.3 Historical reports and proposed reform

The [Federal Council's 2018 DLT report](https://www.newsd.admin.ch/newsd/message/attachments/55153.pdf) is useful historical context. It must not be used to override the subsequent transfer-assistance rule or current legislation.

The October 2025 consultation proposed payment-instrument and crypto-institution licence categories. Its proposed non-custodial treatment is not a launch permission. Confirm the legislative status and commencement at the actual launch date; this briefing does not establish the proposal's assertion that no bill had reached Parliament in early October 2026. [Official consultation announcement](https://www.sif.admin.ch/en/newnsb/x4TMWQ1SWofNoFx7XyHhY), [SIF's current DLT overview](https://www.sif.admin.ch/en/dlt-blockchain-en)

## 4. AML obligations: more than sanctions screening

**AMLO Art. 4(1)(b)** covers assistance transferring virtual currencies to third parties in an ongoing client relationship, or the ability to dispose of them. Its supervised-intermediary-only exclusion is not a general exemption for a retail service. The 2021 explanatory report discusses multi-signature assistance and possible AML scope for encrypted-key storage. The escrow's actual role therefore needs review even if it holds only ciphertext. [Current AMLO](https://www.fedlex.admin.ch/eli/cc/2015/791/de), [2021 explanatory report, section 5.7](https://www.newsd.admin.ch/newsd/message/attachments/67150.pdf)

The AMLA requires identification and beneficial-owner checks, risk-based clarification, records and organisational controls. **Art. 8 now expressly includes preventing breaches of coercive measures under the Embargo Act.** Suspicious circumstances may require reporting to MROS; restrictions on informing affected persons also apply. [Current AMLA, Arts. 3-9 and 10a](https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/de)

Proposed integration into the existing bank framework:

- Bind every assisted account to the authenticated client and the applicable beneficial-owner record.
- Use client eligibility, geography, source-of-funds information, transaction history and bank risk classification, not only the destination address.
- Route unavailable evidence and unresolved risk to a controlled review queue; record who may release a case and why.
- Keep MROS escalation and sanctions reporting in authorised bank processes. Do not expose a suspicious-report decision in a public receipt or customer error message.
- Detect linked transactions, unusual patterns and concurrent requests; a per-call cap does not address structuring or cumulative exposure.
- Apply the same governance to subscriptions, fees and sponsored transactions as to paid transactions.

The proposal's CHF 1,000 / 5,000 / 10,000 thresholds and 24/48-hour delays are **product choices**, not general statutory safe harbours. The current component instead uses token-base-unit limits; it does not convert USDC into CHF or implement all the proposal's recipient/device risk tiers.

## 5. Travel Rule: classify each flow

**AMLO-FINMA Art. 10** specifies originator and beneficiary information for payment orders, with defined domestic simplifications and obligations concerning incomplete data. Paragraph 4 requires appropriate disclosure to the originator about transmitting information; it does not authorise every vendor disclosure. [AMLO-FINMA, Art. 10](https://www.fedlex.admin.ch/eli/cc/2015/390/de)

FINMA applies the rule to blockchain payments. Required information can be exchanged off-chain. Its 2019 guidance does not grant a self-hosted-wallet exemption: it describes own-client ownership verification and an identification/beneficial-owner/ownership route for third-party external wallets. The guidance's discussion of then-unavailable messaging infrastructure is historical, not proof that no such infrastructure exists in 2026. [FINMA Guidance 02/2019](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20190826-finma-aufsichtsmitteilung-02-2019.pdf)

The following is a **proposed assessment matrix**, not a legal determination of each role:

| Flow | Main question | Recommended assisted-service gate |
| --- | --- | --- |
| Bank custody account -> client's Safe | Is the recipient account verified as this client's wallet? | Approved ownership procedure, current client record, screening and recorded transfer context. |
| Client's Safe -> bank custody account | Is the source wallet verified, and are the incoming assets acceptable? | Source/control checks plus the bank's inbound AML process; an earlier signature is not perpetual clearance. |
| Client's Safe -> another Swissquote client's Safe | What bank payment role and internal information process apply? | Verify both account-client bindings and relevant parties; apply the approved intra-bank workflow. |
| Assisted Safe -> exchange or another bank | Does co-signing/execution/sponsorship make Swissquote an involved institution? | Counsel-approved role, counterparty identification and working off-chain messaging process where required. |
| Assisted Safe -> third party's self-hosted wallet | What identity, beneficial-owner and wallet-control checks are required? | Do not rely on a name, warning or address signature alone; complete the approved third-party workflow or refuse assistance. |
| Assisted Safe -> dApp | Who receives value, and what financial service is being provided? | Assess the actual contract, operator, value flow and underlying service; an allowlist entry is not an exemption. |
| Another institution -> client's Safe | Will that institution accept the available ownership evidence? | Supply its challenge/proof procedure without promising universal acceptance. |
| Client-only S1 + S3 operation | Is the bank still involved in a relevant service or payment flow? | Document the boundary; retain applicable bank duties. Do not market independent operation as a legal bypass. |

The proposal's assertion that Swissquote is not the sending institution when co-signing an exchange transfer is **unresolved**. If the answer changes, consequences can include customer information, counterparty onboarding, missing-data handling and reporting—not merely one configuration flag.

Choose a Travel Rule provider only after establishing jurisdictions, counterparty coverage, authenticated endpoints, data protection, evidence retention and outage handling. Standards or network membership are interoperability tools, not legal certification. This repository does not exchange Travel Rule messages.

## 6. Wallet ownership verification

FINMA's 2022 supervisory material describes time-boxed transfers and adequately documented wallet login in front of staff as suitable verification methods. It does not explicitly approve this project's five-minute EIP-712 declaration or its exact MPC/Safe ceremony. [FINMA: money laundering supervision 2022](https://www.finma.ch/en/documentation/dossier/dossier-geldwaeschereibekaempfung/geldwaeschereiaufsicht-2022/)

Three separate questions must be answered: **who the customer is, who can authorise this account, and for whose benefit the assets are held**. A technical signature answers only part of that assessment.

Recommended procedure for bank approval:

1. Authenticate the bank client independently of the dApp or caller-supplied account identifier.
2. Issue a fresh, expiring, single-use challenge binding the client reference, purpose, chain, Safe address, nonce and relevant creation/ownership configuration. Keep personal identifiers off-chain.
3. Verify the actual Safe's authorisation, not only the threshold key's EOA signature. ERC-1271 specifies a smart-contract signature interface; its use is evidence of contract-level authorisation, not a legal ownership certificate. [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)
4. If the Safe is not deployed yet, verify the exact factory/initialisation and counterfactual account through a separately approved method, or defer the verified status until deployment. An owner signature alone does not prove the intended Safe configuration.
5. Preserve method, challenge, result, account configuration and authenticated-client linkage as evidence. Reassess after recovery, owner/module changes and relevant risk events.

EIP-712 helps structure and domain-separate signed messages; it does **not** provide replay protection automatically. Challenge expiry and one-time consumption remain application responsibilities. [EIP-712](https://eips.ethereum.org/EIPS/eip-712)

Avoid a production badge saying "FINMA ownership verified" until the institution has approved the method. Safer prototype wording: "Control proof recorded—bank verification mocked."

## 7. Sanctions: an address result is only one input

Swiss sanctions depend on the relevant ordinances and restrictions administered by SECO, not on an undifferentiated global wallet blacklist. Applicable measures can address people, entities, ownership/control, geography and services. Foreign lists may additionally matter because of a relevant legal nexus or bank policy; they are not all automatically Swiss law. [SECO sanctions resources](https://www.seco.admin.ch/de/sanktionen)

A current example matters: FINMA's August 2026 notice describes restrictions involving Russian crypto platforms and certain cryptoasset development, alongside freezing and reporting obligations. A service restriction may apply without an address appearing in a vendor response. [FINMA sanctions notice, 20 August 2026](https://www.finma.ch/en/news/2026/08/20260820-sr/)

For this project, explicitly approve:

- Required list/ordinance coverage, identifiers, update frequency and provider contract.
- Customer and relevant beneficiary/operator checks, in addition to addresses touched by the reviewed operation.
- Match escalation, false-positive investigation and authorised case disposition.
- Separate SECO and AML reporting workflows where applicable.
- Policy revocation when a recipient, operator or contract becomes restricted.

The implemented TRM adapter uses the address sanctions endpoint. A `CLEAR` result means no match in that response, not "SECO-compliant", "clean source of funds", "Travel Rule completed" or "approved dApp". Missing evidence must not become CLEAR. [TRM introduction](https://docs.trmlabs.com/guides/sanctions/introduction), [TRM screening endpoint](https://docs.trmlabs.com/api/sanctions/screening/submit-one-or-more-addresses-to-be-screened)

Refusing S2 or gas sponsorship can stop Swissquote's assistance. It does not freeze a client-controlled Safe. Counsel must determine the lawful response to an actual order and the bank's available powers; technical inability to freeze is not a blanket exemption from reporting or other obligations.

## 8. Compliant dApp interaction and token classification

### 8.1 Define the bank service before approving the dApp

An approved UI is not enough. The review should identify the service provider, token rights, jurisdictions, administrators, contract/proxy addresses, upgrade powers, economic flows and why Swissquote is offering or recommending the service.

FINMA's token approach looks at economic function, allowing hybrid classifications. For financial instruments and services within **FinSA Art. 3**, relevant conduct duties depend on the activity; investment advice/portfolio management and execution-only services have different assessment rules. Not every cryptoasset is a FinSA financial instrument. [FINMA token-classification guidance](https://www.finma.ch/en/news/2018/02/20180216-mm-ico-wegleitung/), [FinSA, Arts. 3 and 8-15](https://www.fedlex.admin.ch/eli/cc/2019/758/en)

Pooling investor assets for collective investment and management can raise **CISA Art. 7** questions. ERC-4626 is a tokenised-vault interface, not a fund, deposit or securities-law exemption. A "savings vault" needs product analysis based on what it actually does. [Current CISA](https://www.fedlex.admin.ch/eli/cc/2006/822/de)

### 8.2 What the technical controls should accomplish

Recommended production controls:

- Review deployed code and proxy administration; monitor changes and suspend assistance when assumptions no longer hold.
- Bind the decision to exact chain, account, ordered calls, amounts, spender, nonce and final wallet envelope.
- Obtain transaction-specific user approval after the understandable preview; verify any required step-up independently.
- Enforce replay prevention and atomic spending reservations in the host, not only a stateless receipt verifier.
- Treat simulation as predictive evidence. State changes, malicious token behaviour or incomplete traces can defeat its assumptions.
- Authenticate dApp-session provenance; a claimed web origin is not an authenticated origin.
- Review off-chain permits and signing requests separately. A malicious approval may start with a signature rather than an immediate transfer.

The current component supports scoped ERC-20 and ERC-4626 calls. It rejects unsupported calls, delegatecalls, account administration and unlimited approvals. It does **not** implement swap routers, arbitrary messages, permit signing or WalletConnect session management. Do not route those around the checks to claim broad dApp compliance. See [implementation scope and integration responsibilities](COMPLIANCE.md).

An `ALLOW` receipt is a technical assistance decision under a specified policy. It is not a legal certificate, regulator endorsement, investment recommendation or proof of smart-contract safety.

## 9. Recovery, authentication and operational resilience

FINMA's operational-risk framework covers ICT/cyber risks, critical data, continuity and third-party dependencies. Its April 2026 fraud guidance highlights online onboarding and unauthorised account access. Neither establishes that Face ID plus a waiting period is sufficient for this wallet. [Circular 2023/1](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/rundschreiben/finma-rs-2023-01-20221207.pdf?sc_lang=en), [FINMA digital-fraud guidance announcement](https://www.finma.ch/en/news/2026/04/20260409-mm-am-02-2026-digitale-betrugsrisiken/)

Recommended launch evidence:

- A recovery threat model covering account takeover, synced-passkey recovery, spoofed identity checks, coercion, employee collusion and compromised app updates.
- An identity process approved against the bank's onboarding/recovery requirements, with tested liveness limitations. Do not claim attackers cannot fake a face.
- Dual control for sensitive bank actions, independent alert/cancellation channels and no staff shortcut to client-only decryption.
- Reverification of ownership and revocation of old credentials after owner rotation. Review modules and pre-existing approvals as well as the owner key.
- Separate wallet, compliance-receipt and sponsorship keys with controlled rotation and emergency response.
- Tested outages, provider exit, backup restoration, dependency/security reviews and an independently runnable rescue tool.

The 48-hour recovery hold is a design choice, not a statutory recovery period. A 60-second demo timer or mocked liveness check proves only the flow, not production identity assurance.

Incident planning should separately assess FINMA, data-protection and critical-infrastructure reporting. The NCSC/BACS framework provides a 24-hour initial reporting duty for covered operators and qualifying cyberattacks; scope and exceptions must be checked for the actual operators. Do not collapse different regulators' triggers and clocks into one rule. [Official reporting-obligation guidance](https://www.bacs.admin.ch/en/information-on-the-reporting-obligation)

## 10. Privacy, banking secrecy and records

### 10.1 Data protection and bank-client confidentiality

Under the FADP, identifiable wallet-related data can be personal data; uniquely identifying biometrics are sensitive. Processor arrangements, foreign disclosure, transparency, high-risk processing assessments, qualifying automated decisions and breach response require review under the applicable provisions. **Banking Act Art. 47** separately protects bank-client confidentiality. A terms notice is not universal permission to disclose. [FADP, Arts. 5, 9, 16-24 and 31](https://www.fedlex.admin.ch/eli/cc/2022/491/en), [Banking Act, Art. 47](https://www.fedlex.admin.ch/eli/cc/51/117_121_129/de)

Project recommendations:

- Keep KYC, biometrics and Travel Rule personal data off-chain; minimise fields exposed to vendors and public decision proofs.
- Treat a hashed client reference as pseudonymous, not anonymous, when the bank can reconnect it to a person.
- Review disclosure authority and cross-border safeguards per recipient and purpose. Statutory messaging duties do not justify unrelated analytics or marketing.
- Review recipient-name opt-in for scope, withdrawal and anti-enumeration protection; prevent address lookups from becoming a bank-client directory.
- Establish a human-review route for adverse automated assistance decisions where legally required, without disclosing prohibited investigation information.
- Assess the complete processing design, including fraud/liveness vendors; do not assume a legal-duty exception covers every optional feature.

### 10.2 Ten-year retention is not "keep every field forever"

**AMLA Art. 7** requires suitable compliance records and retention for at least ten years after the business relationship ends or the transaction concludes, as applicable. The trigger is not simply the wallet's creation date. [Current AMLA, Art. 7](https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/de)

Recommended record design: an approved retention schedule distinguishing AML evidence, operational telemetry and biometric data; legal holds; restricted access; durable backups; reconstructable decisions and policy versions; documented deletion and regulator retrieval.

The current NDJSON audit sink is single-process and hash-chained. It cannot establish completeness or prevent truncation/history rewriting without externally anchored evidence, and it does not implement a regulated ten-year archive. Production needs durable shared storage and a bank-approved integrity/retention process. See [audit limitations](COMPLIANCE.md#audit-and-regulatory-scope).

## 11. Gaslessness, fees and commercial disclosures

Gas sponsorship changes who pays, not the legal nature of the underlying transaction. It also creates availability and treasury dependencies.

Recommended customer terms should define sponsorship eligibility, quotas, caps, provider outages, failed-operation charging, token-fee alternatives and the independent-exit fee path. A customer should know which fees Swissquote waives and which remain: liquidity-provider fees, spread, price impact, conversion charges and unsponsored network fees.

Use "Swissquote pays the network fee for eligible operations" rather than an unconditional promise of free transactions forever. Premium should waive the stated Swissquote fee, not imply that execution is costless. Maintain conflict-of-interest and referral-fee disclosures where applicable; assess their legal requirements for the actual financial service. [FinSA information duties where in scope](https://www.fedlex.admin.ch/eli/cc/2019/758/en)

## 12. Staking, cards and business services

| Product idea | Assessment needed before launch | Proposed product boundary |
| --- | --- | --- |
| Validator selection, monitoring and reward reporting | Who controls withdrawal credentials, who operates validators, and what custodial/intermediary chain exists? | Separate operational assistance and fees from the client's asset-control claims. |
| Staking commission | Slashing, lock-up, exit/liquidity, counterparty and technology risks; actual fee calculation. | Disclose variable gross and net rewards; do not advertise guaranteed interest. |
| Debit card converting crypto at checkout | Card issuer/acquirer arrangements, conversion/execution service, settlement, AML, geography and consumer terms. | A separate approved card/conversion product; the card does not directly make an on-chain transfer compliant. |
| Cashback and loyalty points | Funding, redemption, expiry, tax and whether tokenised rights change product classification. | Ordinary loyalty programme first; no investment-return promise. |
| Business wallets | Legal-entity/beneficial-owner records, employee authority, limits, succession and signing controls. | Verified business mandates, not merely several devices. |
| Wealth-management wallet services | Advice/management role, financial instruments, client segmentation, asset custody and applicable licensing/conduct rules. | Assess the investment service separately from the wallet interface. |

FINMA's staking guidance distinguishes non-custodial staking from arrangements where a provider controls withdrawal credentials, and discusses custody structures and risks. Applying its non-custodial category to this threshold-wallet design still needs factual analysis. It is not a blanket exemption for validator operation, pooled products or managed portfolios. [FINMA Guidance 08/2023](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20231220-finma-aufsichtsmitteilung-08-2023.pdf?hash=53D5515111D3B47C16C6C3912DEE835A&sc_lang=en)

Holding or transferring a third-party stablecoin is also distinct from Swissquote issuing its own stablecoin. Issuance would be another workstream; do not treat the wallet assessment as authorisation for it.

## 13. Loan idea: on-chain collateral does not replace legal security

### 13.1 Define the proposed product

The simplest proposed version is a **bank loan under a conventional loan agreement, supported by separately documented crypto collateral**, with the chain used for control, valuation visibility and execution. It is not an unregulated DeFi lending product because its collateral vault runs on-chain.

Keep free wallet assets and pledged collateral visibly separate. Assets encumbered by withdrawal restrictions or a lender liquidation right cannot simultaneously be promised as unconditionally withdrawable using S1 + S3.

### 13.2 Questions counsel must resolve

| Issue | Required analysis/design decision |
| --- | --- |
| Parties and jurisdiction | Which Swissquote entity lends, which clients qualify, governing law, collateral location/connectors and cross-border enforcement? |
| Legal asset and security | Is the collateral a payment token, claim, security or other right? What constitutes an enforceable security interest and perfection for that asset? |
| Contract versus code | Does the collateral agreement match the actual deposit, withdrawal, lender and liquidation permissions? Who benefits and who holds title/claims? |
| Insolvency | What happens if the borrower, bank, custodian, issuer or relevant service provider fails? Can the lender enforce, and what can the client recover? |
| Consumer credit | Does the Consumer Credit Act apply, and does a particular exclusion actually fit this collateral arrangement? |
| Financial services | Financing transactions in financial instruments can fall within FinSA Art. 3(c)(5). Do not assume every spot-crypto loan is either inside or outside that definition. |
| Prudential treatment | Bank credit exposure, collateral recognition, concentration, liquidity, valuation and operational risk; overcollateralisation is not proof of zero capital requirements. |
| Liquidation | Lawful enforcement route, notice/cure where applicable, valuation, slippage, costs, proceeds and return of surplus. No automatic appropriation assumption. |
| Reuse | Is rehypothecation permitted? The proposed starting position should be no reuse unless separately justified and expressly agreed. |
| Sanctions/AML | Restricted collateral, borrower/beneficiary checks, provenance, liquidation counterparties and handling freezes/orders. |

**Legal anchors:** the Consumer Credit Act contains exclusions for specified secured credits in **Art. 7(1)(b)**; whether an on-chain crypto vault qualifies cannot be assumed. Swiss Civil Code **Art. 894** invalidates an advance agreement that the pledged object automatically becomes the creditor's property on non-payment in its applicable pledge framework; token classification and the relevant security structure still need analysis. [Consumer Credit Act](https://www.fedlex.admin.ch/eli/cc/2002/593/de), [Swiss Civil Code](https://www.fedlex.admin.ch/eli/cc/24/233_245_233/de), [FinSA](https://www.fedlex.admin.ch/eli/cc/2019/758/en)

Do not claim that depositing tokens automatically creates a perfected Swiss-law pledge, that an oracle proves legally fair valuation, or that crypto collateral always takes a retail loan outside consumer-credit rules.

### 13.3 Engineering work only after product/legal approval

Recommended subsequent build: restricted assets, documented haircuts/LTV and margin triggers, reliable pricing with stale-data handling, withdrawal/debt accounting, audited permissions, safe liquidation integrations and an emergency process. Numerical LTVs are credit-policy choices, not values mandated by the wallet standards.

Recovery must preserve the lien and the borrower's permitted rights. Explain losses, liquidation and any residual debt before borrowing. Prototype the vault on testnet with explicit mock loan/legal assumptions; do not offer real credit on the strength of the demo.

## 14. EU expansion is not automatic

MiCA recital 83 excludes providers of purely non-custodial wallet hardware/software, not all bank services accessed through such a wallet. Recital 22 distinguishes genuinely fully decentralised services without an intermediary from services involving one. The relevant activities and entity must be assessed under MiCA; financial instruments excluded from its scope remain subject to their applicable regime. Credit institutions have an Art. 60 notification route for specified services, rather than every provider requiring the same CASP authorisation. [MiCA, recitals 22/83 and Arts. 2, 59-60](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng)

The EU Transfer of Funds Regulation imposes information duties for covered crypto transfers. Its self-hosted-address provisions include ownership/control assessment for transfers exceeding EUR 1,000; that threshold is **not** a general exemption from all information duties below EUR 1,000. The person-to-person exclusion depends on absence of a CASP, not simply use of a self-hosted address. [Regulation (EU) 2023/1113, Arts. 2, 14 and 16](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1113)

AMF's register identifies **Swissquote Bank Europe SA**, a Luxembourg entity, for specified MiCA services passported into France. That does not give the Swiss bank or every proposed wallet feature automatic EU permission. Confirm the authorised entity, services, passport territories and launch conditions. [AMF register entry](https://www.amf-france.org/fr/espace-epargnants/proteger-son-epargne/listes-blanches/psca/swissquote-bank-europe-sa)

Also assess EU privacy scope and operational/outsourcing obligations for the actual entity and services. EU data-protection applicability is not determined solely by hosting in Switzerland. [EDPB final territorial-scope guidance](https://www.edpb.europa.eu/documents/guideline/guidelines-32018-on-the-territorial-scope-of-the-gdpr-article-3-version-adopted_en)

## 15. Tax and reporting

Swiss tax treatment depends on token rights and taxpayer circumstances. Private payment-token capital gains are generally treated differently from professional trading; staking-pool remuneration is generally income valued in CHF on receipt/acquisition of the relevant entitlement. Cantonal wealth-tax and other product-specific questions remain. Provide transaction, fee and reward exports rather than a universal "tax-free crypto" promise. [Swiss Federal Tax Administration crypto guidance](https://www.estv.admin.ch/de/kryptowaehrungen-besteuerung)

**Current timing correction:** SIF states that Swiss AEOI on cryptoassets cannot begin before **1 January 2027 at the earliest**, and that its legal basis does not apply in 2026. Older announcements targeting 2026 should not be repeated as current law. This is not a guaranteed 2027 commencement date. Assess covered reporting entities/services and the confirmed timetable before launch; self-custody alone does not settle reporting for associated trading services. [SIF crypto-AEOI status](https://www.sif.admin.ch/en/framework-for-the-automatic-exchange-of-information-aeoi-on-crypto-assets)

## 16. Software licences, IP and customer terms

The proposed Silence Laboratories DKLs23 core repository carries a **non-commercial-use licence**, with restrictions extending beyond an ordinary permissive open-source licence. Its definition excludes anticipated commercial application and internal business use. The proposal should not categorically say that a bank-focused, prize-bearing hackathon qualifies. Confirm the exact WASM/package licence and obtain permission or an appropriate commercial agreement where required. [DKLs23 licence](https://github.com/silence-laboratories/dkls23/blob/main/LICENSE)

Project launch checklist:

- Inventory exact versions, licences, notices and redistribution obligations for every SDK, contract and generated/bundled dependency.
- Verify commercial rights separately from security audit scope; an audited cryptographic core does not establish that its wrapper or integration is audited.
- Resolve known dependency vulnerabilities and obtain appropriate software/security review.
- Define customer rights and responsibilities for share loss, failed recovery, independent use, fees, outages, disputes and service termination.
- Use prototype branding with clear hackathon status; do not imply an official Swissquote launch, partnership or regulatory approval without authority.

Changing MPC libraries to solve licensing can change recovery capabilities, threat assumptions and the reviewed custody model. Reassess the whole design rather than treating it as a drop-in legal fix.

## 17. Claims in the proposal that need qualification

This briefing supplements, rather than silently rewrites, the proposal:

| Current claim or implication | Defensible working position |
| --- | --- |
| "This is not custody"; no balance-sheet, capital or segregation implications | Non-custodial design hypothesis, conditional on effective control, agreements and separate legal/accounting analysis. |
| Encrypted escrow eliminates the partner grey zone | It limits access if implemented correctly; the partner's AML, outsourcing and insolvency role remains to be assessed. |
| Bank participation and a five-minute declaration automatically prove FINMA ownership | Useful evidence within a proposed method; bank-approved verification must address Safe authorisation, deployment, identity and changes. |
| The co-signer's policy service carries out the bank's AML duties | It supplies some technical controls; KYC, monitoring, Travel Rule, reporting and case management remain separate integrations. |
| Swissquote is not the sending institution; only a flag changes if FINMA disagrees | Unresolved role classification with potentially substantive operational and disclosure consequences. |
| A third-party wallet warning/name/control signature suffices | Those inputs do not substitute for required identity, beneficial-owner and payment checks. |
| A hash chain establishes ten-year record compliance | Integrity aid only; retention triggers, completeness, durability, access and deletion need an approved archive. |
| MiCA's non-custodial exclusion plus a group licence enables EU launch | Assess each feature, legal entity, service permission and country; the pure-software exclusion is narrow. |
| A hackathon is necessarily allowed by the MPC licence | Confirm the precise licence and intended use with the rights holder. |
| Phone/email/SIM compromise or liveness spoofing cannot succeed | Test explicit adversary scenarios and describe residual risk; do not promise absolute fraud prevention. |

## 18. What this repository implements—and what remains

This is a snapshot of the **dApp compliance component**, not a claim about completion of the entire wallet proposal. See [COMPLIANCE.md](COMPLIANCE.md) for reproducible tests and integration instructions.

| Area | Present in this component | Required outside it / before launch |
| --- | --- | --- |
| Assistance policy | Strict decoding, registry, limits, refusal/review/step-up outcomes | Approved policy ownership, product classification and controlled changes. |
| Sanctions | TRM address adapter; deterministic demo fixtures | Contracted list coverage, identity/service restrictions, bank escalation and monitoring. |
| Simulation | Live viem adapter and ordered call evidence | Final Safe/UserOperation validation, deployed-contract review and upgrade monitoring. |
| Authorising receipts | Signed expiring decisions tied to intent and subject | Trusted identity/account binding, pinned keys/policy, transaction-specific authentication, replay consumption. |
| Daily spending | Provider interface and demo usage | Bank ledger with atomic reservations; live currently returns REVIEW where required usage evidence is unavailable. |
| Wallet ownership | Not implemented | Approved control-verification process, Safe deployment/configuration checks and refresh after changes. |
| Travel Rule | Not implemented | Role determination, counterparty/data workflow and approved provider integration. |
| Audit | Single-process hash-chained NDJSON | Durable shared archive, independent integrity evidence and approved retention/access process. |
| Wallet/MPC/recovery/paymaster | Not implemented by this component; a separate wallet backend was subsequently added | Reconcile the section 2.1 differences, integrate the intended compliance controls, verify custody/control and test recovery/exit and sponsored execution. |
| Bank identity and legal case management | Not implemented | Actual bank authentication/KYC, MROS/SECO handling, review staff and privacy governance. |

Demo evidence is not production evidence: the example vault address is synthetic, usage fixtures start from zero, and DEMO receipts must not authorise live assistance. A read-only live provider check did not sign or broadcast a transaction. The hackathon's real testnet-transfer requirement still belongs to the wallet integration.

## 19. Launch gates and questions for counsel

Recommended accountable workstreams:

1. **Legal + architecture:** settle custody/control, entity and escrow roles against a documented permissions inventory.
2. **Bank compliance:** approve client eligibility, transfer-flow classifications, ownership methods, AML/sanctions/Travel Rule and escalation processes.
3. **Security + operations:** validate ceremonies, passkeys, recovery, independent exit, contracts, providers, change control and incident response.
4. **Privacy + records:** approve data mapping, confidentiality, vendor/cross-border arrangements and the retention/archival system.
5. **Risk + finance + product:** approve fees, sponsorship, credit exposure, marketing, client disclosures and any staking/card/managed services.
6. **Engineering acceptance:** demonstrate that final operations exactly match approved intent, limits resist concurrency/replay, outages fail closed for assistance, and client-only access remains usable.

Questions requiring a written answer before real-client launch:

- Does Swissquote's complete practical/contractual control qualify as custody in any lifecycle phase?
- Can any Swissquote-controlled recovery, module, supplier or update path obtain a second usable share?
- What are the escrow's applicable permissions/supervision and contractual obligations?
- Is the proposed Safe ownership method acceptable, including before deployment and after rotation?
- What institution role applies to each co-signed transfer, and which third-party-wallet workflows are permitted?
- Which sanctions lists, service/geographic restrictions, monitoring and reporting procedures apply?
- Which proposed tokens/dApps are financial instruments, investment products or collective schemes?
- What security interest and enforcement structure is valid for the loan collateral; does consumer-credit law apply?
- Which legal entity may offer each EU service, and what additional notification, privacy or operational requirements apply?
- Are the exact MPC dependencies licensed for this prototype and the intended commercial use?

## 20. Annotated primary-source reading list

The inline links above support the analysis. Start with these sources; recheck their current versions before launch.

### Swiss laws and supervisory practice

- [AMLA / GwG, SR 955.0](https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/de): client/beneficial-owner due diligence, records, organisation and reporting; current 1 October 2026 text.
- [AMLO / GwV, SR 955.01](https://www.fedlex.admin.ch/eli/cc/2015/791/de): Art. 4 transfer assistance; distinguish this Federal Council ordinance from AMLO-FINMA.
- [AMLO-FINMA / GwV-FINMA, SR 955.033.0](https://www.fedlex.admin.ch/eli/cc/2015/390/de): Art. 10 payment information and related bank obligations.
- [FINMA Guidance 02/2019](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20190826-finma-aufsichtsmitteilung-02-2019.pdf): blockchain payments, off-chain information and wallet verification; read its historical context carefully.
- [FINMA AML supervision 2022](https://www.finma.ch/en/documentation/dossier/dossier-geldwaeschereibekaempfung/geldwaeschereiaufsicht-2022/): further wallet-control verification methods, including time-boxing.
- [2021 AMLO explanatory report](https://www.newsd.admin.ch/newsd/message/attachments/67150.pdf): section 5.7 background to transfer assistance and key-storage scope.
- [Banking Act, SR 952.0](https://www.fedlex.admin.ch/eli/cc/51/117_121_129/de) and [SchKG, SR 281.1](https://www.fedlex.admin.ch/eli/cc/11/529_488_529/de): custody/segregation, data access and banking secrecy.
- [FINMA Guidance 01/2026](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20260112-finma-aufsichtsmitteilung-01-2026.pdf): crypto custody and related prudential requirements.
- [FINMA Guidance 08/2023](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20231220-finma-aufsichtsmitteilung-08-2023.pdf?hash=53D5515111D3B47C16C6C3912DEE835A&sc_lang=en): staking arrangements and risks.
- [SECO sanctions resources](https://www.seco.admin.ch/de/sanktionen): current Swiss ordinances and official sanctions information.
- [FADP, SR 235.1](https://www.fedlex.admin.ch/eli/cc/2022/491/en): data protection; check the authoritative-language version where translation timing matters.
- [FinSA, SR 950.1](https://www.fedlex.admin.ch/eli/cc/2019/758/en) and [CISA, SR 951.31](https://www.fedlex.admin.ch/eli/cc/2006/822/de): financial-service and collective-investment scope.
- [Consumer Credit Act, SR 221.214.1](https://www.fedlex.admin.ch/eli/cc/2002/593/de) and [Civil Code, SR 210](https://www.fedlex.admin.ch/eli/cc/24/233_245_233/de): credit and possible collateral-law questions, subject to asset/structure analysis.
- [FINMA Circular 2023/1](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/rundschreiben/finma-rs-2023-01-20221207.pdf?sc_lang=en), [outsourcing framework](https://www.finma.ch/en/news/2017/12/20171205-mm-rs-outsourcing/) and [digital-fraud guidance](https://www.finma.ch/en/news/2026/04/20260409-mm-am-02-2026-digitale-betrugsrisiken/): bank operational, third-party and fraud controls.
- [NCSC/BACS reporting guidance](https://www.bacs.admin.ch/en/information-on-the-reporting-obligation): separate critical-infrastructure incident-reporting assessment.
- [Federal Tax Administration crypto guidance](https://www.estv.admin.ch/de/kryptowaehrungen-besteuerung) and [SIF crypto-AEOI status](https://www.sif.admin.ch/en/framework-for-the-automatic-exchange-of-information-aeoi-on-crypto-assets): taxation and reporting timetable; not personal tax advice.

### EU, technical evidence and licensing

- [MiCA, Regulation (EU) 2023/1114](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng): activity/entity assessment, pure-wallet distinction and bank route.
- [Transfer of Funds Regulation (EU) 2023/1113](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1113): information requirements and self-hosted transfers.
- [AMF: Swissquote Bank Europe SA](https://www.amf-france.org/fr/espace-epargnants/proteger-son-epargne/listes-blanches/psca/swissquote-bank-europe-sa): entity-specific public register evidence, not permission for every group feature.
- [EDPB final GDPR territorial-scope guidance](https://www.edpb.europa.eu/documents/guideline/guidelines-32018-on-the-territorial-scope-of-the-gdpr-article-3-version-adopted_en): EU privacy applicability assessment.
- [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) and [EIP-712](https://eips.ethereum.org/EIPS/eip-712): technical proof/signature interfaces, not regulator-endorsed ownership procedures.
- [TRM sanctions documentation](https://docs.trmlabs.com/guides/sanctions/introduction): limits and integration context of the screening tool used here.
- [DKLs23 licence](https://github.com/silence-laboratories/dkls23/blob/main/LICENSE): exact commercial-use restrictions require separate review.

**Research hygiene:** secondary legal commentary in the proposal is useful for identifying questions, but is not treated here as binding law. Consultation drafts, earlier reporting dates, UI labels, public-library availability and vendor audit claims must not be promoted into regulatory approval.
