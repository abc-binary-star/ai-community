// Package model: AnnotationEmbedding 想法向量
//
// 想法语义邻居（近邻边）依赖向量检索。向量列用 pgvector 的 vector 类型存储，
// 由 dal 层用原生 SQL 建表与建索引管理——GORM 不认识 vector 类型，因此本模型
// 只登记非向量字段，vector 列不作为 GORM 字段，读写走原生 SQL。
package model

import "time"

// AnnotationEmbedding 想法向量记录。
//
// 一条想法一条记录（annotation_id 唯一）。Dim 记录生成时的向量维度，便于换模型
// 后识别旧维度数据。embedding 向量列不在此结构体里，由 dal 用 SQL 维护。
type AnnotationEmbedding struct {
	AnnotationID string    `gorm:"primaryKey;size:36" json:"annotationId"`
	PostID       string    `gorm:"index;not null" json:"postId"`
	Model        string    `gorm:"size:64" json:"model"`
	Dim          int       `gorm:"not null" json:"dim"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}
