// @paystack/inline-js ships no types (and no @types package exists). Only
// the slice actually used here — resumeTransaction — is declared.
declare module '@paystack/inline-js' {
  interface PaystackTransaction {
    reference: string;
    id?: number;
    message?: string;
  }
  interface ResumeCallbacks {
    onSuccess?: (transaction: PaystackTransaction) => void;
    onCancel?: () => void;
    onError?: (error: { message: string }) => void;
    onLoad?: (info: { id: number; customer: unknown; accessCode: string }) => void;
  }
  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: ResumeCallbacks): unknown;
  }
}
