// Barrel — UI code imports from '@/lib/signing'.
// lib/signing/* has zero React/Next dependencies; it is loaded by golden tests
// from plain Node.

export * from './types';
export { serialize, toHex, fromHex } from './serialize';
export { actionHash } from './actionHash';
export { phantomAgent } from './phantomAgent';
export { l1Payload } from './l1Payload';
export { typedDataHashes } from './typedDataHashes';
export type { TypedDataHashes } from './typedDataHashes';
export {
  userSignedTypedData,
  userSignedHashes,
  SEND_MULTI_SIG_TYPES,
  CONVERT_TO_MULTI_SIG_USER_TYPES,
  SIGNATURE_CHAIN_ID,
} from './userSigned';
export type { UserSignedTypedData, Eip712Field } from './userSigned';
export {
  multiSigEnvelope,
  cosignTypedData,
  buildMultiSigAction,
  sendMultiSigTypedData,
  convertToMultiSigUserAction,
  convertTypedData,
  convertInnerAction,
  cosignConvertTypedData,
} from './multisig';
export type {
  MultiSigEnvelope,
  MultiSigAction,
  ConvertToMultiSigUserAction,
  ConvertInnerAction,
} from './multisig';
export { addMultiSigSignTypes } from './userSigned';
export {
  submitExchange,
  submitMultiSig,
  submitUserSigned,
  SubmitNetworkError,
  SubmitHttpError,
} from './submit';
export type { SubmitArgs, SubmitMultiSigArgs, SubmitUserSignedArgs } from './submit';
