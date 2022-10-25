import { ApolloClient, InMemoryCache, ApolloProvider, gql, ApolloLink, HttpLink, split, useQuery } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'

const httpLink = new HttpLink({
  uri: `http://localhost:4000/graphql`, 
  credentials: 'same-origin',
});

const wsLink = new GraphQLWsLink(createClient({
  url: 'ws://localhost:4000/subscriptions',
}));

// The split function takes three parameters:
//
// * A function that's called for each operation to execute
// * The Link to use for an operation if the function returns a "truthy" value
// * The Link to use for an operation if the function returns a "falsy" value
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink,
);

const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql',
  link: splitLink,
  credentials: 'same-origin',
  cache: new InMemoryCache(),
});

const sendMessage = async (message: String,author: String)=> {
  return client
    .mutate({
      variables: {message, author},
      mutation: gql`
        mutation SendMessage($message: String, $author: String) {
          sendMessage(content: $message,author: $author)
        }
      `,
    })
}

const messagesSubscription = gql`
  subscription MessageSend {
    messageSend {
      content
      author
    }
  }
`;


const subscribe = () => {
  client.subscribe({
    query: messagesSubscription,
  })
  .subscribe({
    next(data) {
        console.log(data);
      // ... call updateQuery to integrate the new comment
      // into the existing list of comments
    },
    error(err) { console.error('err', err); },
  });
}

const messagesQuery = gql`
  query Messages {
    messages {
      content
      author
    }
  }
`;

function Message({message, currentAuthor}) {
  const isMe = message.author === currentAuthor;

  let color = isMe ?'#1e68ad' : 'rgb(30 173 117)';
  if(message.author === 'system') {
    color = 'rgb(101 101 101)'
  }

  return (
    <div style={{width: '100%',display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: 20}}>
      <div style={{float: isMe ? 'right' : 'left'}}>
          <div style={{fontWeight: 'bold', fontSize: 12, textTransform: 'uppercase'}}>{message.author}</div>
          <div style={{width: 200, background: color, padding: 10, borderRadius: 10}}>{message.content}</div>
      </div>
    </div>
  );
}

function Messenger({author}) {
  const [messages,setMessages] = useState([]);
  const [currentMessage,setCurrentMessage] = useState('');
  const {data,error, subscribeToMore} = useQuery(messagesQuery);

  useEffect(()=>{
    if(error){
      console.error(error);
    }
  },[error]);

  useEffect(()=>{
    if(data){
      setMessages(data.messages);
    }
  },[data])

  useEffect(()=>{
    const unsubscribe = subscribeToMore({
      document: messagesSubscription,
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;
        const newMessage = subscriptionData.data.messageSend;

        return Object.assign({}, prev, {
          messages: [...prev.messages,newMessage]
        });
      }
    })
    return () => unsubscribe()
  },[]);

  const send = async () => {
    await sendMessage(currentMessage, author);
    setCurrentMessage('');
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      send()
    }
  }

  return (
    <div style={{width: '100%', height:'80vh', display: 'flex', flexDirection:'column', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.3)', padding: 20, boxSizing:'border-box' }}>
      <div className="content">
        {messages.map(message => <Message message={message} currentAuthor={author} />)}
      </div>
      <div className="controls" style={{display:'flex'}}>
        <input style={{width: '100%', marginRight:12}} type='text' placeholder="Type your message" value={currentMessage} onChange={event => setCurrentMessage(event.target.value)} onKeyDown={handleKeyDown} />
        <button style={{minWidth: 200, border: '1px solid white'}} onClick={send}>send</button>
      </div>
    </div>);
}

function Login() {
  const [author,setAuthor] = useState('');
  const [isAuthorized,setIsAuthorized] = useState(false);

  const authorize = () => {
    if(author.length > 3) {
      setIsAuthorized(true)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      authorize()
    }
  }

  return (
  <div style={{padding:20}}>
      {!isAuthorized && (
        <div style={{width: '100%',height:'80vh', display:'flex', alignItems:'center',justifyContent:'center', flexDirection:'column'}}>
          <input type='text' placeholder="Enter name" value={author} onChange={(event) => setAuthor(event.target.value)} onKeyDown={handleKeyDown} />
          <button style={{display:'block', marginTop: 20}} onClick={authorize}>Login</button>
        </div>
      )}
      {isAuthorized && (
      <Messenger author={author} />
      )}
  </div>
  );
}

function Header() {
  return (
    <div className="header">
      <div style={{display:'flex',flexDirection:'column', alignItems:'center'}}>
        <div>
          <a href="https://vitejs.dev" target="_blank">
            <img src="/vite.svg" className="logo" alt="Vite logo" />
          </a>
          <a href="https://reactjs.org" target="_blank">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>
        <div>
          <h3>(Vite + React) Messenger</h3>
          <h4 style={{marginTop: -20}}> With Graphql subscriptions</h4>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [count, setCount] = useState(0)

  return (
    <ApolloProvider client={client}>
      <Header />
      <Login />
    </ApolloProvider>
  )
}

export default App
