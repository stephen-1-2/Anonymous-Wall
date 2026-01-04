CREATE DATABASE IF NOT EXISTS `message_board` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `message_board`;

-- 留言表（包含文件内容）
CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(64) NOT NULL,
  `content` TEXT,
  `mediaData` LONGBLOB,
  `mediaType` VARCHAR(20),
  `mediaFileName` VARCHAR(255),
  `mediaMimeType` VARCHAR(100),
  `createTime` VARCHAR(64),
  `isDeleted` TINYINT(1) DEFAULT 0,
  `likeCount` INT DEFAULT 0,
  `commentCount` INT DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 点赞表
CREATE TABLE IF NOT EXISTS `likes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `messageId` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(64) NOT NULL,
  `createTime` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_like` (`messageId`, `userId`),
  FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 评论表
CREATE TABLE IF NOT EXISTS `comments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `messageId` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(64) NOT NULL,
  `content` TEXT NOT NULL,
  `createTime` VARCHAR(64),
  `isDeleted` TINYINT(1) DEFAULT 0,
  FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;