-- Auth users, AI key store, and team chat (moved off the filesystem into Postgres).

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameLower" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "salt" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_usernameLower_key" ON "AppUser"("usernameLower");

-- CreateTable
CREATE TABLE "AppApiKey" (
    "service" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppApiKey_pkey" PRIMARY KEY ("service")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "seq" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "mediaUrl" TEXT,
    "mediaPath" TEXT,
    "mediaMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_id_key" ON "ChatMessage"("id");
