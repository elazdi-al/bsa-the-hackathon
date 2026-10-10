type Verification = {
  provider: string;
  title: string;
  notice: string;
  followUp: string;
  supportEmail: string;
};

export const verification: Verification = {
  provider: "Bridge",
  title: "is verifying your identity",
  notice: "Verification can take up to 3 business days.",
  followUp: "If you haven’t received a response after this time, contact",
  supportEmail: "support@bridge.xyz",
};
