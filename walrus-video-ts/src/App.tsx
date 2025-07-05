import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { WalrusClient } from "@mysten/walrus";

import "./App.css";
import { useEffect } from "react";

function App() {
  const suiClient = new SuiClient({
    url: getFullnodeUrl("testnet"),
  });

  const walrusClient = new WalrusClient({
    network: "testnet",
    suiClient,
  });

  useEffect(() => {
    const init = async () => {
      const videoMetaData = await suiClient.getObject({
        id: "0x2",
        options: {
          showContent: true,
        },
      });

      console.log(videoMetaData);
    };

    init();
  }, []);

  return <></>;
}

export default App;
