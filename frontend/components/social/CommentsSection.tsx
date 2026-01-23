import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../design-system/colors';

interface Comment {
  id: string;
  user: string;
  userAvatar?: string;
  text: string;
  timestamp: string;
  likes: number;
  isLiked?: boolean;
  replies?: Comment[];
}

interface CommentsSectionProps {
  comments: Comment[];
  onAddComment?: (text: string) => void;
  onLikeComment?: (commentId: string) => void;
  onReplyToComment?: (commentId: string, text: string) => void;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  comments: initialComments,
  onAddComment,
  onLikeComment,
  onReplyToComment,
}) => {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleAddComment = () => {
    if (newComment.trim()) {
      const comment: Comment = {
        id: Date.now().toString(),
        user: 'You',
        text: newComment.trim(),
        timestamp: 'Just now',
        likes: 0,
        isLiked: false,
        replies: [],
      };
      setComments([comment, ...comments]);
      setNewComment('');
      onAddComment?.(newComment.trim());
    }
  };

  const handleLike = (commentId: string) => {
    setComments(
      comments.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              likes: comment.isLiked ? comment.likes - 1 : comment.likes + 1,
              isLiked: !comment.isLiked,
            }
          : comment
      )
    );
    onLikeComment?.(commentId);
  };

  const handleReply = (commentId: string) => {
    if (replyText.trim()) {
      const reply: Comment = {
        id: Date.now().toString(),
        user: 'You',
        text: replyText.trim(),
        timestamp: 'Just now',
        likes: 0,
        isLiked: false,
      };

      setComments(
        comments.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                replies: [...(comment.replies || []), reply],
              }
            : comment
        )
      );
      setReplyText('');
      setReplyingTo(null);
      onReplyToComment?.(commentId, replyText.trim());
    }
  };

  const formatTimestamp = (timestamp: string) => {
    // Simple timestamp formatting
    return timestamp;
  };

  const renderComment = (comment: Comment, isReply: boolean = false) => (
    <View key={comment.id} style={[styles.commentCard, isReply && styles.replyCard]}>
      <View style={styles.commentHeader}>
        <View style={styles.userAvatar}>
          <Ionicons name="person" size={20} color={colors.primary.trackOrange} />
        </View>
        <View style={styles.commentHeaderInfo}>
          <Text style={styles.userName}>{comment.user}</Text>
          <Text style={styles.timestamp}>{formatTimestamp(comment.timestamp)}</Text>
        </View>
      </View>

      <Text style={styles.commentText}>{comment.text}</Text>

      <View style={styles.commentActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleLike(comment.id)}
        >
          <Ionicons
            name={comment.isLiked ? 'heart' : 'heart-outline'}
            size={18}
            color={comment.isLiked ? colors.primary.trackOrange : colors.text.tertiary}
          />
          <Text
            style={[
              styles.actionText,
              comment.isLiked && { color: colors.primary.trackOrange },
            ]}
          >
            {comment.likes > 0 ? comment.likes : 'Like'}
          </Text>
        </TouchableOpacity>

        {!isReply && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setReplyingTo(comment.id)}
          >
            <Ionicons name="chatbubble-outline" size={16} color={colors.text.tertiary} />
            <Text style={styles.actionText}>Reply</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Reply Input */}
      {replyingTo === comment.id && (
        <View style={styles.replyInputContainer}>
          <TextInput
            style={styles.replyInput}
            placeholder="Write a reply..."
            placeholderTextColor={colors.text.tertiary}
            value={replyText}
            onChangeText={setReplyText}
            multiline
            autoFocus
          />
          <View style={styles.replyActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setReplyingTo(null);
                setReplyText('');
              }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.postReplyButton}
              onPress={() => handleReply(comment.id)}
            >
              <Text style={styles.postReplyText}>Reply</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {comment.replies.map((reply) => renderComment(reply, true))}
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Comments</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{comments.length}</Text>
        </View>
      </View>

      {/* Add Comment Input */}
      <View style={styles.addCommentContainer}>
        <View style={styles.inputAvatar}>
          <Ionicons name="person" size={20} color={colors.primary.trackOrange} />
        </View>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            placeholderTextColor={colors.text.tertiary}
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.postButton,
              !newComment.trim() && styles.postButtonDisabled,
            ]}
            onPress={handleAddComment}
            disabled={!newComment.trim()}
          >
            <Ionicons
              name="send"
              size={20}
              color={newComment.trim() ? colors.text.white : colors.text.tertiary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Comments List */}
      <ScrollView
        style={styles.commentsList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {comments.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color={colors.text.tertiary}
            />
            <Text style={styles.emptyText}>No comments yet</Text>
            <Text style={styles.emptySubtext}>Be the first to comment!</Text>
          </View>
        ) : (
          comments.map((comment) => renderComment(comment))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.light,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
  },
  countBadge: {
    backgroundColor: colors.primary.trackOrange,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  countText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.white,
  },
  addCommentContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.light,
  },
  inputAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    maxHeight: 100,
  },
  postButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary.trackOrange,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postButtonDisabled: {
    backgroundColor: colors.backgrounds.cream,
    borderColor: colors.text.tertiary,
  },
  commentsList: {
    flex: 1,
    padding: 16,
  },
  commentCard: {
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    padding: 12,
    marginBottom: 12,
  },
  replyCard: {
    backgroundColor: colors.backgrounds.white,
    borderWidth: 2,
    marginLeft: 16,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentHeaderInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
  },
  timestamp: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  commentText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 20,
    marginBottom: 10,
  },
  commentActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  replyInputContainer: {
    marginTop: 12,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    padding: 10,
  },
  replyInput: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
    minHeight: 40,
  },
  replyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.tertiary,
  },
  postReplyButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary.trackOrange,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  postReplyText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.white,
  },
  repliesContainer: {
    marginTop: 8,
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 4,
  },
});
