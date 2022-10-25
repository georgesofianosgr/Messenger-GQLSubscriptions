import express, { Express, Request, Response } from 'express';
import { ApolloServer, ApolloServerPlugin } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import cors from 'cors';
import parser from 'body-parser';
import dotenv from 'dotenv';
import http from 'http';
import { RedisPubSub } from 'graphql-redis-subscriptions';
const pubsub = new RedisPubSub();

const {json} = parser;
dotenv.config();

const app: Express = express();
const port = process.env.PORT;

const httpServer = http.createServer(app);


app.get('/', (req: Request, res: Response) => {
  res.send('Express + TypeScript Server');
});

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = `#graphql
  # Comments in GraphQL strings (such as this one) start with the hash (#) symbol.

  # This "Book" type defines the queryable fields for every book in our data source.
  type Book {
    title: String
    author: String
  }

  type Message {
    content: String
    author: String
  }

  # The "Query" type is special: it lists all of the available queries that
  # clients can execute, along with the return type for each. In this
  # case, the "books" query returns an array of zero or more Books (defined above).
  type Query {
    messages: [Message!]!
    books: [Book]
  }
  type Mutation {
    sendMessage(content: String, author: String): Boolean
  }

  type Subscription {
    messageSend: Message
}
`;

const books = [
  {
    title: 'The Awakening',
    author: 'Kate Chopin',
  },
  {
    title: 'City of Glass',
    author: 'Paul Auster',
  },
];

const errorLogPlugin: ApolloServerPlugin = {
  async requestDidStart() {
    return {
      didEncounterErrors: async ({ errors } : any) => {
        errors.forEach((error:any) => {
          const { originalError } = error;
          const { code } = originalError || {};
          const level = code ? 'warn' : 'error';
          const output = {
            err: { ...error, code, stack: error.stack },
          };

          console.log(`GRAPHQL_API_ERROR: ${error.message}`, output);
        });
      },
    };
  },
};



const resolvers = {
  Query: {
    books: () => books,
    messages: () => [{content: 'welcome to test subscriptions messenger', author:'system'}],
  },
  Mutation: {
    sendMessage: (context: any,args: any) => {
      console.log('sendMessage',args);
      pubsub.publish('MESSAGE_SEND', { sendMessage: {content: args.content, author: args.author}});
      return true;
    }
  },
  Subscription: {
    // hello: {
    //   // Example using an async generator
    //   subscribe: async function* () {
    //     for await (const word of ['Hello', 'Bonjour', 'Ciao']) {
    //       yield { hello: word };
    //     }
    //   },
    // },
    messageSend: {
      // More on pubsub below
      resolve: (payload: any) => {
        console.log('payload',payload);
        return payload.sendMessage;
      },
      subscribe: () => pubsub.asyncIterator('MESSAGE_SEND'),
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });



// Creating the WebSocket server
const wsServer = new WebSocketServer({
  // This is the `httpServer` we created in a previous step.
  server: httpServer,
  // Pass a different path here if app.use
  // serves expressMiddleware at a different path
  path: '/subscriptions',
});

const serverCleanup = useServer({ 
   schema,
   onConnect: (ctx) => {
      console.log('client connected');
      // console.log('Connect', ctx);
    },
    onSubscribe: (ctx, msg) => {
      console.log('client subscribed');
      // console.log('Subscribe', { ctx, msg });
    },
    // onNext: (ctx, msg, args, result) => {
    //   console.debug('Next', { ctx, msg, args, result });
    // },
    // onError: (ctx, msg, errors) => {
    //   console.error('Error', { ctx, msg, errors });
    // },
    // onComplete: (ctx, msg) => {
    //   console.log('Complete', { ctx, msg });
    // },
}, wsServer);

const server = new ApolloServer({
  schema,
  plugins: [
    // Proper shutdown for the HTTP server.
    ApolloServerPluginDrainHttpServer({ httpServer }),
    // Proper shutdown for the WebSocket server.
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
    errorLogPlugin,
  ],
});


await server.start();

app.use('/graphql', cors<cors.CorsRequest>({origin:[process.env.CLIENT ?? "http://localhost:5173"]}), json(), expressMiddleware(server));

// Modified server startup
await new Promise<void>((resolve) => httpServer.listen({ port: 4000 }, resolve));
console.log(`🚀 Server ready at http://localhost:4000/`);

