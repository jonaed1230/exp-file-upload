import { GraphQLServer } from "graphql-yoga";
import { createWriteStream } from "fs";
import { PrismaClient } from "@prisma/client";
import * as mkdirp from "mkdirp";
import * as shortid from "shortid";

const prisma = new PrismaClient();
const uploadDir = "./uploads";

mkdirp.sync(uploadDir);

const storeUpload = async (args: { stream: any, filename: string }) => {
  const { stream, filename } = args;
  const id = shortid.generate();
  const path = `${uploadDir}/${id}-${filename}`;

  return new Promise((resolv, reject) =>
    stream
      .pipe(createWriteStream(path))
      .on("finish", () => resolv({ id, path }))
      .on("error", reject)
  );
};

const recordFile = async (file: { id: string, filename: string, mimetype: string, encoding: string, path: string }) => {
  return prisma.upload.create({
    data: file,
    select: {
      id: true,
      filename: true,
      mimetype: true,
      encoding: true,
      path: true
    }
  });
}

const processUpload = async (upload: any) => {
  const { createReadStream, filename, mimetype, encoding } = await upload;
  const stream = createReadStream();
  // I am unable to assign any type to line below Type 'unknown' is not assignable to type '{ id: string; path: string; }'.
  const { id, path }: any = await storeUpload({ stream, filename });
  return recordFile({ id, filename, mimetype, encoding, path });
}

const typeDefs = `
  # this is needed for upload to work
  scalar Upload

  type Query {
    uploads (take: Int! skip: Int!): [File]
  }

  type Mutation {
    singleUpload (file: Upload!): File!
    multipleUpload (files: [Upload!]!): [File!]!
  }

  type File {
    id: ID!
    path: String!
    filename: String!
    mimetype: String!
    encoding: String!
  }
`;

const resolvers = {
  Query: {
    uploads: async(_root: any, args: { take: number, skip: number }) => prisma.upload.findMany({
      ...args,
      select: {
        id: true,
        path: true,
        filename: true,
        mimetype: true,
        encoding: true
      }
    })
  },
  Mutation: {
    singleUpload: (_root: any, args: { file: {} }) => processUpload(args.file),
    multipleUpload: (_root: any, args: { files: [] }) => Promise.all(args.files.map(processUpload)),
  }
}

const server = new GraphQLServer({ typeDefs, resolvers });

server.start(() => console.log('Server is running on http://localhost:4000'));
