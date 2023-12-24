import './App.css';
import Chatbot, {
  FloatingActionButtonTrigger,
  ModalView,
} from "mongodb-chatbot-ui";

function App() {
  return (
    <div className="App">
            <h1>
                MongoDB AI Assistant
            </h1>
            <Chatbot serverBaseUrl={`${process.env.REACT_APP_BACKEND_URL}/api/v1`}>
                <FloatingActionButtonTrigger text="My MongoDB AI" />
                <ModalView
                    initialMessageText="Welcome to MongoDB AI Assistant. What can I help you with?"
                    initialMessageSuggestedPrompts={[
                        "How do I create a new MongoDB Atlas cluster?",
                        "Can MongoDB store lists of data?",
                        "How does vector search work?",
                    ]}
                />
            </Chatbot>
    </div>
  );
}



export default App;
