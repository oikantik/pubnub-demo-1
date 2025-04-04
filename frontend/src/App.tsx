import "./App.css";
import PubNubProvider from "./components/PubNubProvider";
import Chat from "./components/Chat";
import "./components/Chat.css";

function App() {
  return (
    <PubNubProvider>
      <div className="app">
        <h1>PubNub Demo</h1>
        <Chat />
      </div>
    </PubNubProvider>
  );
}

export default App;
