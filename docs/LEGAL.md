# Legal position

Research checked on 10 October 2026, against Swiss law including the 1 October 2026 AMLA and AMLO amendments ([FINMA notice](https://www.finma.ch/en/documentation/dossier/dossier-geldwaeschereibekaempfung/hinweise-zur-revision-des-geldwaeschereigesetzes-und-der-geldwaeschereiverordnung/)). This is engineering research, not legal advice or FINMA approval. Our proposition is client-controlled assets with regulated bank assistance. The [README](../README.md#legal-position) has the short version.

## Why this is not custody

Crypto custody under the Banking Act turns on an undertaking to keep assets available for the client and allocated to them ([BankA Art. 16 no. 1bis and Art. 37d](https://www.fedlex.admin.ch/eli/cc/51/117_121_129/de), [FINMA Guidance 01/2026](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20260112-finma-aufsichtsmitteilung-01-2026.pdf)). The practical test is who can move the funds. We argue Swissquote cannot:

- The power of disposal sits with the client. The account accepts a transfer only with the passkey, which lives in the client's phone. No Swissquote key meets that rule, alone or combined with the independent service's. Anyone can read the rule in the deployed contract.
- The assets sit in the client's own account contract, not in Swissquote's name or on its books. Swissquote offers screening, recovery help and, for a linked wallet, gas. It does not undertake to keep the assets available.
- Swissquote's remaining powers are availability powers. Withholding Share B, refusing sponsorship, locking the reported phone of a linked wallet and cancelling a recovery as guardian decide whether Swissquote helps. None of them moves an asset or changes who controls it.

The weak point is practical. While Swissquote runs, withholding Share B stops the client from paying once the key cache expires. A regulator could read that as control. Exit mode answers this for a Swissquote that is gone. For a Swissquote that refuses one client, we propose two answers. The client contract allows refusal only on a legal ground. In production, the independent service would also open exit mode for that client after a notice period. That second answer is a design, not built. Counsel must weigh these powers. The licensing reform consulted on from October 2025 is not a launch permission ([SIF consultation](https://www.sif.admin.ch/en/newnsb/x4TMWQ1SWofNoFx7XyHhY)).

## Shared control with the independent service

Shared control between a bank and a partner is a grey zone when the two together can move funds. Here they cannot. Together they can rebuild only the wallet key, and the account refuses any transfer without the passkey and any recovery without the Recovery Key. So even combined, Swissquote and the independent service lack the power of disposal. What remains of the grey zone is the availability powers above, not disposal.

The independent service holds a usable share, so its AML and outsourcing role needs its own review ([FINMA outsourcing](https://www.finma.ch/en/news/2017/12/20171205-mm-rs-outsourcing/)).

## Travel Rule

Payment orders carry originator and beneficiary data ([AMLO-FINMA Art. 10](https://www.fedlex.admin.ch/eli/cc/2015/390/de)). FINMA applies this to crypto with no self-hosted-wallet exemption, and transfers to a client's own wallet need ownership proven by suitable technical means ([FINMA Guidance 02/2019](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20190826-finma-aufsichtsmitteilung-02-2019.pdf)). FINMA has described suitable methods, including a message to the blockchain within a set time and time-boxed transfers ([2020 annual report, pp. 43 to 44](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/finma-publikationen/geschaeftsbericht/20200325-finma-jahresbericht-2020.pdf), [AML supervision 2022](https://www.finma.ch/en/documentation/dossier/dossier-geldwaeschereibekaempfung/geldwaeschereiaufsicht-2022/)).

Creating a wallet needs no Swissquote account, so the proof comes with an optional step. The client links the wallet to their Swissquote account from the app. The app sends them to their Swissquote account to sign in. Swissquote identified them when they opened that account, so the wallet runs no identity check of its own. They then sign with Face ID a statement that the wallet belongs to that client number. The passkey that signs it is the one the account requires for every payment. Swissquote holds that proof from the moment of the link, so a transfer between the client's Swissquote account and a linked wallet needs no whitelisting form and no test transfer. An unlinked wallet goes through Swissquote's usual procedure for an external wallet, as for any self-hosted wallet. Swissquote shows the proof only to the owner, because who owns a wallet is covered by banking secrecy.

A link made inside the signed-in Swissquote app is useful evidence, not automatic acceptance. A production proof should verify the account itself through [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) with a fresh single-use challenge, since [EIP-712](https://eips.ethereum.org/EIPS/eip-712) gives no replay protection by itself. `SwissquoteAccount` does not implement ERC-1271 yet. A recovery replaces the passkey, so the statement must be signed again after each recovery. This build does not do that yet.

## Is Swissquote the sending institution?

When the client pays a third party from the wallet, the client signs and the client's account sends. Swissquote screens the call, relays the signed operation and, for a linked wallet, pays the gas. It cannot change the recipient or the amount, because the phone checks the operation before Face ID and the account checks the signatures.

Our position is that Swissquote is not the ordering institution for that transfer. It never holds the assets and never decides to send them. It is still a financial intermediary for the assistance itself. AMLO Art. 4(1)(b) covers helping transfer virtual currencies to third parties in a continuing relationship, even without power of disposal ([AMLO](https://www.fedlex.admin.ch/eli/cc/2015/791/de), [2021 explanatory report, section 5.7](https://www.newsd.admin.ch/newsd/message/attachments/67150.pdf)). So KYC, monitoring and sanctions duties apply to every sponsored payment.

Until FINMA or counsel confirms that reading, we would launch conservatively and treat each sponsored payment as if Swissquote were the ordering institution:

- A payment to an address Swissquote can attribute to another institution, such as an exchange deposit address, gets originator and beneficiary data sent through a Travel Rule protocol before Swissquote sponsors it. If the receiving institution cannot take the data, Swissquote does not sponsor the payment.
- A payment above 1,000 USDC to another self-hosted wallet asks the client for the beneficiary's name.
- Swissquote records originator data for every sponsored payment.

This posture is a design. This build exchanges no Travel Rule messages.

Because KYC duties apply to every sponsored payment, Swissquote sponsors payments only for wallets it can tie to an identified client. A wallet linked to a Swissquote account gets its payments and dApp calls sponsored, and Swissquote knows the client behind them, because it identified them when they opened their account. An unlinked wallet pays its own gas in ETH. Swissquote still screens its payments and relays them. Swissquote still pays for any wallet's recovery, which moves no funds, so a lost phone is never unrecoverable for lack of ETH.

## Other rules that apply

- **AML.** Swissquote is a bank and already under AMLA, which now expressly covers Embargo Act breaches ([AMLA](https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/de)). The policy engine supplies technical controls. KYC, monitoring, MROS reporting and case management stay in bank processes.
- **Sanctions.** Swiss sanctions follow SECO ordinances, which can target people, ownership, geography and services, not just addresses ([SECO](https://www.seco.admin.ch/de/sanktionen), [FINMA notice of 20 August 2026](https://www.finma.ch/en/news/2026/08/20260820-sr/)). Refusing sponsorship stops Swissquote's help. Counsel decides the lawful response to an actual order.
- **dApps and tokens.** An allowlist entry is not an exemption. Token function decides FinSA and CISA scope, and an ERC-4626 vault is not a fund exemption ([FINMA token guidance](https://www.finma.ch/en/news/2018/02/20180216-mm-ico-wegleitung/), [FinSA](https://www.fedlex.admin.ch/eli/cc/2019/758/en), [CISA](https://www.fedlex.admin.ch/eli/cc/2006/822/de)).
- **Recovery.** The 48-hour delay is a design choice, not a statutory period. Recovery checks no ID, linked or not, so its only defences are the Recovery Key, the delay and the client's cancel. Production recovery falls under FINMA's operational-risk and fraud expectations ([Circular 2023/1](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/rundschreiben/finma-rs-2023-01-20221207.pdf?sc_lang=en), [digital-fraud guidance](https://www.finma.ch/en/news/2026/04/20260409-mm-am-02-2026-digitale-betrugsrisiken/)).
- **Privacy and records.** Wallet data can be personal data and biometrics are sensitive ([FADP](https://www.fedlex.admin.ch/eli/cc/2022/491/en)). Showing one client that another banks with Swissquote would touch banking secrecy (BankA Art. 47), which is why the owner record goes only to the owner. AML records are kept at least ten years after the relationship or transaction ends ([AMLA Art. 7](https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/de)).
- **EU.** MiCA's exclusion covers pure non-custodial wallet software, not every bank service reached through one ([MiCA recitals 22 and 83](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng)). The Transfer of Funds Regulation requires an ownership assessment for self-hosted transfers above EUR 1,000, which is not a general exemption below it ([Regulation 2023/1113](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1113)). Swissquote's MiCA authorisation sits with Swissquote Bank Europe SA ([AMF register](https://www.amf-france.org/fr/espace-epargnants/proteger-son-epargne/listes-blanches/psca/swissquote-bank-europe-sa)) and needs per-feature checks.

Staking, loans, cards and wealth services are out of scope and need their own assessments.

## Questions for counsel before a real launch

- Do Swissquote's powers here (withholding Share B, the lock, guardian cancel, sponsorship) amount to custody in any phase?
- What permissions, supervision and contracts does the independent service need, including for exit mode?
- Is the ownership proof acceptable before deployment and after a recovery replaces the passkey? Is the usual external-wallet procedure the right one for an unlinked wallet?
- Is Swissquote the ordering institution for a sponsored transfer, and which third-party-wallet flows are allowed?
- Swissquote screens and relays an unlinked wallet's payments, and pays for its recovery, without knowing its owner. Does that assistance alone make Swissquote a financial intermediary for those payments, so that the owner must be identified first?
- Which sanctions lists, service restrictions and reporting procedures apply?
