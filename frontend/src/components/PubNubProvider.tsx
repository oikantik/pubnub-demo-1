import React from "react";
import PubNub from "pubnub";
import { PubNubProvider as Provider } from "pubnub-react";

const PUBNUB_PUBLISH_KEY =
  import.meta.env.VITE_PUBNUB_PUBLISH_KEY || "pub-c-your-publish-key";
const PUBNUB_SUBSCRIBE_KEY =
  import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY || "sub-c-your-subscribe-key";

interface PubNubProviderProps {
  children: React.ReactNode;
}

const PubNubProvider: React.FC<PubNubProviderProps> = ({ children }) => {
  const pubnub = new PubNub({
    publishKey: PUBNUB_PUBLISH_KEY,
    subscribeKey: PUBNUB_SUBSCRIBE_KEY,
    userId: `user-${Math.random().toString(36).substring(2, 9)}`, // Generate a random user ID
  });

  return <Provider client={pubnub}>{children}</Provider>;
};

export default PubNubProvider;
