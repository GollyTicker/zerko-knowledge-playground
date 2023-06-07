import { AccountUpdate, Bool, Field, Mina, Poseidon, PrivateKey, SmartContract, State, method, state } from 'snarkyjs';
import { Add } from './Add.js';

export { Add };

const secret = new Field(123123123123);

const publiclyKnownHash = Poseidon.hash([secret]);
console.log("The publicly known hash is", publiclyKnownHash.toJSON());

console.log("We know the message, of which the hash this is. But how do we prove we know it without revealing it?")

console.log("The method knowsPreimage(secret, hash) only is verifyable, if the provided secret was correct.")

console.log("First we put this into a smart contract ...")

// Inspired by https://docs.minaprotocol.com/zkapps/tutorials/hello-world

export class RuntimeSmartContract extends SmartContract {
  @state(Field) expectedHash = State<Field>(); // public field
  @state(Bool) knowsSecret = State<Bool>(); // used to detect, if the secret has been provided

  init() {
    super.init();
    this.expectedHash.set(publiclyKnownHash);
    this.knowsSecret.set(new Bool(false));
  }

  @method knowsHashPreimage(secret: Field) { // private method inputs
    // Before using this.expectedHash, we need to do this.
    this.expectedHash.assertEquals(this.expectedHash.get());
    this.knowsSecret.assertEquals(this.knowsSecret.get());

    // compute and verify the hash
    let actualHash = Poseidon.hash([secret]);
    actualHash.assertEquals(this.expectedHash.get());

    // secret has been provided! save truth result!
    this.knowsSecret.set(new Bool(true));
  }
}


console.log("... and deploy into a local blockchain.")

const proofsEnabled = false; // todo. what does this mean?
const Local = Mina.LocalBlockchain({proofsEnabled: proofsEnabled});
Mina.setActiveInstance(Local);

const { privateKey: deployerKey, publicKey: deployerAccount } = Local.testAccounts[0];
const { privateKey: senderKey, publicKey: senderAccount } = Local.testAccounts[1];

const contractPrivateKey = PrivateKey.random();
const contractPublicKey = contractPrivateKey.toPublicKey();

const contract = new RuntimeSmartContract(contractPublicKey);

const deployTx = await Mina.transaction(deployerAccount, () => {
  AccountUpdate.fundNewAccount(deployerAccount);
  contract.deploy();
})

await deployTx.sign([deployerKey, contractPrivateKey]).send();

console.log("Deployed contract at address" + contractPublicKey);

console.log("Public hash in the smart contract:" + contract.expectedHash.get().toString());

console.log("Has someone yet proven, that they know the secret hash pre-image?", contract.knowsSecret.get().toBoolean());

console.log("If we provide the wrong secret, then the transaction to prove the secret to the chain fails:")

try {
  const failedSecretGuess = new Field(1337);
  await Mina.transaction(senderAccount, () => contract.knowsHashPreimage(failedSecretGuess));
} catch(e: any) {
  console.log(e.message);
}

console.log("Has someone yet proven, that they know the secret hash pre-image?", contract.knowsSecret.get().toBoolean());

console.log("Now the person who knows the secret can provide a proof of their knowledge by submitting a verifiable zk transaction.")

const knowsSecretTx = await Mina.transaction(senderAccount, () => contract.knowsHashPreimage(secret));

console.log("Transaction verification key hash:", knowsSecretTx.toPretty()[1].authorizationKind.verificationKeyHash);

console.log("Generating proof...")

await knowsSecretTx.prove();

console.log("Transaction with proof authorization:",  knowsSecretTx.toPretty()[1].authorization.proof);

console.log("Deploying proven tx into blockchain.")

await knowsSecretTx.sign([senderKey]).send();

console.log("Has someone yet proven, that they know the secret hash pre-image?", contract.knowsSecret.get().toBoolean());

console.log("This concludes our proof!");
